import express from 'express';
import prisma from '../config/database.js';
import { Prisma } from '@prisma/client';
import { notify, getAdminIds } from '../services/notificationService.js';

const router = express.Router();

// Get filter options (for dropdowns) - MUST be before /:id route
router.get('/meta/filters', async (req, res, next) => {
    try {
        const [programmes, regionalCenters, studentsWithSubjects, importBatches, studentsForCF] = await Promise.all([
            prisma.student.findMany({
                select: { programme: true },
                distinct: ['programme'],
                where: { programme: { not: null } },
            }),
            prisma.student.findMany({
                select: { regionalCenter: true },
                distinct: ['regionalCenter'],
                where: { regionalCenter: { not: null } },
            }),
            prisma.student.findMany({
                select: { subjects: true },
                where: { subjects: { not: null } },
            }),
            // Completed import batches so orders page can filter by file
            prisma.importHistory.findMany({
                where: { status: 'COMPLETED', importType: 'STUDENTS' },
                select: { id: true, fileName: true, importedCount: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            }),
            // Scan customFields for all unique keys
            prisma.student.findMany({
                select: { customFields: true },
                where: { customFields: { not: null } },
                take: 500,
            }),
        ]);

        // Extract unique subjects from all students' subjects arrays
        const subjectsSet = new Set();
        studentsWithSubjects.forEach(student => {
            if (student.subjects && Array.isArray(student.subjects)) {
                student.subjects.forEach(subject => {
                    if (subject && subject.trim()) {
                        subjectsSet.add(subject.trim());
                    }
                });
            }
        });

        // Collect unique custom field keys across all students
        const customFieldKeysSet = new Set();
        studentsForCF.forEach(s => {
            if (s.customFields && typeof s.customFields === 'object') {
                Object.keys(s.customFields).forEach(k => {
                    if (k && k.trim()) customFieldKeysSet.add(k.trim());
                });
            }
        });

        // Sort all arrays alphabetically
        const sortedProgrammes = programmes.map(p => p.programme).filter(Boolean).sort((a, b) => a.localeCompare(b));
        const sortedRegionalCenters = regionalCenters.map(r => r.regionalCenter).filter(Boolean).sort((a, b) => a.localeCompare(b));
        const sortedSubjects = Array.from(subjectsSet).sort((a, b) => a.localeCompare(b));
        const customFieldKeys = Array.from(customFieldKeysSet).sort((a, b) => a.localeCompare(b));

        res.json({
            success: true,
            data: {
                programmes: sortedProgrammes,
                regionalCenters: sortedRegionalCenters,
                subjects: sortedSubjects,
                customFieldKeys,
                statuses: ['NEW_LEAD', 'SYNOPSIS_SENT', 'GUIDE_ASSIGNED', 'REPORT_IN_PROGRESS', 'SHIPPED', 'ALL_DONE'],
                importBatches: importBatches.map(b => ({
                    id: b.id.toString(),
                    fileName: b.fileName,
                    importedCount: b.importedCount,
                    createdAt: b.createdAt,
                })),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Export students to Excel - MUST be before /:id route
router.get('/export/excel', async (req, res, next) => {
    try {
        const XLSX = await import('xlsx');

        const {
            search = '',
            status,
            programme,
            regionalCenter,
            subject,
        } = req.query;

        // Build the same where clause as the main GET endpoint
        const where = {};

        if (search) {
            where.OR = [
                { fullName: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
                { enrollmentNo: { contains: search } },
                { programme: { contains: search } },
                { course: { contains: search } },
                { city: { contains: search } },
                { state: { contains: search } },
                { regionalCenter: { contains: search } },
                { customFields: { string_contains: search } },
            ];
        }

        if (status) where.status = status;
        if (programme) where.programme = { equals: programme };
        if (regionalCenter) where.regionalCenter = { equals: regionalCenter };
        if (subject) {
            where.subjects = {
                array_contains: [subject]
            };
        }

        // Fetch all matching students (no pagination for export)
        const students = await prisma.student.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                controlNumber: true,
                enrollmentNo: true,
                fullName: true,
                email: true,
                alternateEmail: true,
                phone: true,
                programme: true,
                regionalCenter: true,
                subjects: true,
                status: true,
            },
        });

        // Convert to Excel format with subjects as separate CRS columns
        const excelData = students.map(student => {
            const row = {
                'Control Number': student.controlNumber || '',
                'Enrollment No': student.enrollmentNo || '',
                'Name': student.fullName || '',
                'Email': student.email || '',
                'Alternate Email': student.alternateEmail || '',
                'Phone': student.phone || '',
                'Programme': student.programme || '',
                'Regional Center': student.regionalCenter || '',
                'Status': student.status || '',
            };

            // Add subjects as CRS1, CRS2, etc. columns
            if (student.subjects && Array.isArray(student.subjects)) {
                student.subjects.forEach((subj, idx) => {
                    row[`CRS${idx + 1}`] = subj || '';
                });
            }

            return row;
        });

        // Create workbook and worksheet
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

        // Auto-size columns
        const colWidths = {};
        excelData.forEach(row => {
            Object.keys(row).forEach(key => {
                const len = String(row[key]).length;
                colWidths[key] = Math.max(colWidths[key] || key.length, len);
            });
        });
        worksheet['!cols'] = Object.keys(colWidths).map(key => ({ wch: Math.min(colWidths[key] + 2, 50) }));

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Set headers for file download
        const filename = `students_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);

        res.send(buffer);
    } catch (error) {
        next(error);
    }
});

// Bulk update status - MUST be before /:id route
router.post('/bulk-update', async (req, res, next) => {
    try {
        const { ids, status } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'IDs array is required',
            });
        }

        const bigIntIds = ids.map(id => BigInt(id));

        const result = await prisma.student.updateMany({
            where: { id: { in: bigIntIds } },
            data: { status },
        });

        res.json({
            success: true,
            message: `${result.count} students updated successfully`,
            data: { count: result.count },
        });
    } catch (error) {
        next(error);
    }
});

// Bulk delete - MUST be before /:id route
router.post('/bulk-delete', async (req, res, next) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'IDs array is required',
            });
        }

        const bigIntIds = ids.map(id => BigInt(id));

        const result = await prisma.student.deleteMany({
            where: { id: { in: bigIntIds } },
        });

        res.json({
            success: true,
            message: `${result.count} students deleted successfully`,
            data: { count: result.count },
        });
    } catch (error) {
        next(error);
    }
});

// Co-handle an order (second telecaller takes over when primary is absent)
router.post('/co-handle/:id', async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'MANAGER';
        const isTelecaller = req.user.role === 'STAFF' && req.user.staffRole === 'TELECALLER';
        if (!isAdmin && !isTelecaller) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }

        const studentId = BigInt(req.params.id);
        const [student] = await prisma.$queryRaw`
            SELECT id, full_name as fullName, assigned_by_id as assignedById, co_handled_by_id as coHandledById
            FROM students WHERE id = ${studentId}
        `;

        if (!student) return res.status(404).json({ success: false, message: 'Order not found' });

        // Can't co-handle your own order
        if (student.assignedById === req.user.id || student.assignedById === BigInt(req.user.id)) {
            return res.status(400).json({ success: false, message: 'You are already the primary telecaller for this order' });
        }

        // Already has a co-handler
        if (student.coHandledById) {
            return res.status(400).json({ success: false, message: 'This order already has a co-handler. A 3rd handler requires admin approval.' });
        }

        await prisma.$executeRaw`
            UPDATE students SET co_handled_by_id = ${req.user.id}, co_handled_at = NOW() WHERE id = ${studentId}
        `;

        res.json({ success: true, message: 'You are now co-handling this order (50/50 commission split)' });
    } catch (error) {
        next(error);
    }
});

// Assign student to a guide/expert — MUST be before /:id route
router.post('/assign/:id', async (req, res, next) => {
    try {
        const isTelecaller = req.user.role === 'STAFF' && req.user.staffRole === 'TELECALLER';
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER' && !isTelecaller) {
            return res.status(403).json({ success: false, message: 'Only admins, leaders, and telecallers can assign students' });
        }

        const studentId = BigInt(req.params.id);
        const { guideId } = req.body;

        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { customFields: true },
        });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const nextCustomFields = student.customFields && typeof student.customFields === 'object'
            ? { ...student.customFields }
            : {};


        await prisma.$transaction([
            prisma.$executeRaw`UPDATE students SET assigned_guide_id = ${guideId ? parseInt(guideId) : null}, assigned_by_id = ${guideId ? parseInt(req.user.id) : null} WHERE id = ${studentId}`,
            prisma.student.update({
                where: { id: studentId },
                data: { customFields: Object.keys(nextCustomFields).length > 0 ? nextCustomFields : null },
            })
        ]);

        const [updated] = await prisma.$queryRaw`
            SELECT CAST(s.id AS CHAR) as "id", s.full_name as "fullName", s.assigned_guide_id as "assignedGuideId", s.assigned_by_id as "assignedById",
                   s.custom_fields as "customFields",
                   u.id as "guideId", u.full_name as "guideName", u.staff_role as "guideStaffRole", u.degree as "guideDegree",
                   a.id as "assignerId", a.full_name as "assignerName", a.staff_role as "assignerRole"
            FROM students s
            LEFT JOIN users u ON u.id = s.assigned_guide_id
            LEFT JOIN users a ON a.id = s.assigned_by_id
            WHERE s.id = ${studentId}
        `;

        const updatedFields = updated.customFields || {};
        const data = {
            id: updated.id,
            fullName: updated.fullName,
            assignedGuideId: updated.assignedGuideId,
            assignedById: updated.assignedById,
            assignedGuide: updated.guideId ? {
                id: updated.guideId,
                fullName: updated.guideName,
                staffRole: updated.guideStaffRole,
                degree: updated.guideDegree,
            } : null,
            assignedBy: updated.assignerId ? {
                id: updated.assignerId,
                fullName: updated.assignerName,
                staffRole: updated.assignerRole,
            } : null,
        };

        const io = req.app.get('io');

        // Notify the assigned guide
        if (guideId) {
            await notify(io, {
                userIds: [parseInt(guideId)],
                type: 'STUDENT_ASSIGNED',
                title: 'Student Assigned to You',
                message: `${student.fullName || 'A student'} has been assigned to you.`,
                link: `/orders/${studentId}`,
            });
        }

        res.json({
            success: true,
            message: guideId ? 'Student assigned successfully' : 'Assignment removed',
            data,
        });
    } catch (error) {
        next(error);
    }
});

// Get all students with pagination, filtering, and sorting
router.get('/', async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 50,
            search = '',
            status,
            programme,
            regionalCenter,
            subject,
            importBatchId,
            source,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = Math.min(parseInt(limit), 100);
        const skip = (pageNum - 1) * limitNum;

        const where = {};

        if (search) {
            where.OR = [
                { fullName: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
                { enrollmentNo: { contains: search } },
                { programme: { contains: search } },
                { course: { contains: search } },
                { city: { contains: search } },
                { state: { contains: search } },
                { regionalCenter: { contains: search } },
                { customFields: { string_contains: search } },
            ];
        }

        if (status) {
            where.status = status;
        } else {
            // Hide completed orders by default
            where.status = { not: 'ALL_DONE' };
        }

        if (programme) where.programme = { equals: programme };
        if (regionalCenter) where.regionalCenter = { equals: regionalCenter };
        if (subject) {
            where.subjects = { array_contains: [subject] };
        }
        if (importBatchId) where.importBatchId = BigInt(importBatchId);
        if (source) where.source = source;

        // STAFF (guides/experts) only see students assigned to them
        // Use raw numeric filter — no Prisma relation needed
        const isTelecaller = req.user.role === 'STAFF' && req.user.staffRole === 'TELECALLER';
        if (req.user.role === 'STAFF' && !isTelecaller) {
            where.assignedGuideId = req.user.id;
        }

        const total = await prisma.student.count({ where });

        // Fetch students WITHOUT relation select (Prisma client may not have assignedGuide type yet)
        const students = await prisma.student.findMany({
            where,
            skip,
            take: limitNum,
            orderBy: { [sortBy]: sortOrder },
            select: {
                id: true,
                enrollmentNo: true,
                fullName: true,
                email: true,
                phone: true,
                course: true,
                programme: true,
                batchYear: true,
                status: true,
                city: true,
                state: true,
                regionalCenter: true,
                subjects: true,
                customFields: true,
                source: true,
                createdAt: true,
            },
        });

        // Get student IDs (as numbers for raw SQL)
        const studentIds = students.map(s => s.id);

        // Fetch the assigned_guide_id column + guide info via raw SQL (bypass Prisma client type limit)
        let guideMap = {};
        if (studentIds.length > 0) {
            const rows = await prisma.$queryRaw`
                SELECT s.id, s.assigned_guide_id, s.assigned_by_id, s.created_by_id, s.co_handled_by_id,
                       u.id as guide_id, u.full_name as guide_name,
                       u.staff_role as guide_staff_role, u.degree as guide_degree,
                       a.id as assigner_id, a.full_name as assigner_name, a.staff_role as assigner_staff_role,
                       c.id as creator_id, c.full_name as creator_name, c.staff_role as creator_staff_role
                FROM students s
                LEFT JOIN users u ON u.id = s.assigned_guide_id
                LEFT JOIN users a ON a.id = s.assigned_by_id
                LEFT JOIN users c ON c.id = s.created_by_id
                WHERE s.id IN (${Prisma.join(studentIds)})
            `;
            rows.forEach(row => {
                guideMap[row.id.toString()] = {
                    assignedGuideId: row.assigned_guide_id ? Number(row.assigned_guide_id) : null,
                    assignedGuide: row.guide_id ? {
                        id: Number(row.guide_id),
                        fullName: row.guide_name,
                        staffRole: row.guide_staff_role,
                        degree: row.guide_degree,
                    } : null,
                    assignedById: row.assigned_by_id ? Number(row.assigned_by_id) : null,
                    assignedBy: row.assigner_id ? {
                        id: Number(row.assigner_id),
                        fullName: row.assigner_name,
                        staffRole: row.assigner_staff_role,
                    } : null,
                    createdById: row.created_by_id ? Number(row.created_by_id) : null,
                    createdBy: row.creator_id ? {
                        id: Number(row.creator_id),
                        fullName: row.creator_name,
                        staffRole: row.creator_staff_role,
                    } : null,
                    coHandledById: row.co_handled_by_id ? Number(row.co_handled_by_id) : null,
                };
            });
        }

        // Merge guide info back into student records
        const serializedStudents = students.map(s => ({
            ...s,
            id: s.id.toString(),
            ...(guideMap[s.id.toString()] || { assignedGuideId: null, assignedGuide: null, assignedById: null, assignedBy: null, createdById: null, createdBy: null, coHandledById: null }),
        }));

        res.json({
            success: true,
            data: {
                students: serializedStudents,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get student by ID
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const student = await prisma.student.findUnique({
            where: { id: BigInt(id) },
            include: {
                lead: {
                    select: {
                        id: true,
                        stage: true,
                        source: true,
                    },
                },
                createdBy: {
                    select: {
                        id: true,
                        fullName: true,
                    },
                },
            },
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found',
            });
        }

        const serializedStudent = {
            ...student,
            id: student.id.toString(),
            leadId: student.leadId?.toString(),
            importBatchId: student.importBatchId?.toString(),
            lead: student.lead ? {
                ...student.lead,
                id: student.lead.id.toString(),
            } : null,
        };

        res.json({
            success: true,
            data: serializedStudent,
        });
    } catch (error) {
        next(error);
    }
});

// Create student
router.post('/', async (req, res, next) => {
    try {
        const {
            enrollmentNo,
            fullName,
            email,
            phone,
            alternatePhone,
            dateOfBirth,
            gender,
            course,
            specialization,
            batchYear,
            semester,
            admissionDate,
            address,
            city,
            state,
            pincode,
            country,
            status,
            customFields,
        } = req.body;

        if (!fullName) {
            return res.status(400).json({
                success: false,
                message: 'Full name is required',
            });
        }

        const student = await prisma.student.create({
            data: {
                enrollmentNo: enrollmentNo || null,
                fullName,
                email: email || null,
                phone: phone || null,
                alternatePhone: alternatePhone || null,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                gender: gender || null,
                course: course || null,
                specialization: specialization || null,
                batchYear: batchYear ? parseInt(batchYear) : null,
                semester: semester ? parseInt(semester) : null,
                admissionDate: admissionDate ? new Date(admissionDate) : null,
                address: address || null,
                city: city || null,
                state: state || null,
                pincode: pincode || null,
                country: country || 'India',
                status: status || 'NEW_LEAD',
                source: 'manual',
                createdById: req.user.id,
                customFields: customFields || null,
            },
        });

        res.status(201).json({
            success: true,
            message: 'Student created successfully',
            data: {
                ...student,
                id: student.id.toString(),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Update student
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        if (updateData.dateOfBirth) {
            updateData.dateOfBirth = new Date(updateData.dateOfBirth);
        }
        if (updateData.admissionDate) {
            updateData.admissionDate = new Date(updateData.admissionDate);
        }
        if (updateData.batchYear) {
            updateData.batchYear = parseInt(updateData.batchYear);
        }
        if (updateData.semester) {
            updateData.semester = parseInt(updateData.semester);
        }

        delete updateData.id;
        delete updateData.createdAt;
        delete updateData.createdById;

        // Convert empty strings to null for unique or optional fields to prevent unique constraint errors
        const optionalStringFields = ['enrollmentNo', 'controlNumber', 'email', 'phone', 'alternatePhone', 'alternateEmail'];
        optionalStringFields.forEach(field => {
            if (updateData[field] === '') {
                updateData[field] = null;
            }
        });

        const student = await prisma.student.update({
            where: { id: BigInt(id) },
            data: updateData,
        });

        res.json({
            success: true,
            message: 'Student updated successfully',
            data: {
                ...student,
                id: student.id.toString(),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Delete student
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { permanent = false } = req.query;

        if (permanent === 'true') {
            if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
                return res.status(403).json({
                    success: false,
                    message: 'Only admins and leaders can permanently delete records',
                });
            }

            await prisma.student.delete({
                where: { id: BigInt(id) },
            });
        } else {
            await prisma.student.update({
                where: { id: BigInt(id) },
                data: { status: 'INACTIVE' },
            });
        }

        res.json({
            success: true,
            message: permanent === 'true'
                ? 'Student permanently deleted'
                : 'Student archived successfully',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
