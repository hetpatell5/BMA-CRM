import express from 'express';
import prisma from '../config/database.js';
import { Prisma } from '@prisma/client';
import { notify, getAdminIds } from '../services/notificationService.js';
import { ensureOrderIdForCustomFields } from '../services/orderIdService.js';
import { readSettings } from './appSettingsRoutes.js';

const router = express.Router();

const normalizeComparable = (value) => String(value || '').trim().toLowerCase();
const TELECALLER_OWNERS_FIELD = '_telecallerOwners';

const readCustomFieldObject = (customFields) => (
    customFields && typeof customFields === 'object' && !Array.isArray(customFields)
        ? { ...customFields }
        : {}
);

const normalizeTelecallerOwner = (entry) => {   
    if (!entry || typeof entry !== 'object') return null;

    const parsedId = entry.id === null || entry.id === undefined || entry.id === ''
        ? null 
        : Number(entry.id);
    const name = String(entry.name || entry.fullName || '').trim();

    if (!name) return null;

    return {
        id: Number.isFinite(parsedId) ? parsedId : null,
        name,
        role: entry.role ? String(entry.role) : null,
        staffRole: entry.staffRole ? String(entry.staffRole) : null,
        addedAt: entry.addedAt ? String(entry.addedAt) : null,
        sharePercent: entry.sharePercent === null || entry.sharePercent === undefined || entry.sharePercent === ''
            ? null
            : Number(entry.sharePercent),
    };
};

const uniqueTelecallerOwners = (owners) => {
    const seen = new Set();
    const normalized = [];

    owners.forEach((entry) => {
        const owner = normalizeTelecallerOwner(entry);
        if (!owner) return;

        const key = owner.id !== null
            ? `id:${owner.id}`
            : `name:${normalizeComparable(owner.name)}`;

        if (seen.has(key)) return;
        seen.add(key);
        normalized.push(owner);
    });

    return normalized;
};

const withEqualCommissionSplit = (owners) => {
    if (!owners.length) return [];

    const baseShare = Number((100 / owners.length).toFixed(2));
    let allocated = 0;

    return owners.map((owner, index) => {
        const sharePercent = index === owners.length - 1
            ? Number((100 - allocated).toFixed(2))
            : baseShare;

        allocated = Number((allocated + sharePercent).toFixed(2));

        return {
            ...owner,
            sharePercent,
        };
    });
};

const customFieldText = (customFields, ...keywords) => {
    if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return '';

    const normalizedKeywords = keywords.map(keyword => normalizeComparable(keyword));

    for (const [key, value] of Object.entries(customFields)) {
        if (value === null || value === undefined || typeof value === 'object') continue;

        const normalizedKey = normalizeComparable(key);
        if (normalizedKeywords.some(keyword => normalizedKey === keyword || normalizedKey.includes(keyword))) {
            return String(value).trim();
        }
    }

    return '';
};

const getStudentProgramme = (student) => (
    student.programme ||
    student.course ||
    customFieldText(student.customFields, 'program name', 'programme', 'program', 'course')
);

const getStudentRegionalCenter = (student) => (
    student.regionalCenter ||
    customFieldText(student.customFields, 'regional center', 'regional centre', 'regionalcenter', 'rc')
);

const getGeneratedOrderId = (student) => {
    const customFields = readCustomFieldObject(student.customFields);
    return customFields._orderIdGenerated === true
        ? (customFields['Order ID'] || student.controlNumber || null)
        : null;
};

async function applyOrderIdBackfill(students, settings = readSettings()) {
    let updated = 0;

    for (const student of students) {
        const orderIdResult = await ensureOrderIdForCustomFields(
            prisma,
            student.customFields || {},
            student.customFields || {},
            student.controlNumber,
            settings,
        );
        const nextCustomFields = Object.keys(orderIdResult.customFields).length > 0
            ? orderIdResult.customFields
            : null;
        const shouldUpdateOrderId =
            orderIdResult.changed === true ||
            (
                orderIdResult.generated === true &&
                orderIdResult.orderId &&
                (
                    student.controlNumber !== orderIdResult.orderId ||
                    JSON.stringify(student.customFields || {}) !== JSON.stringify(nextCustomFields || {})
                )
            );

        if (shouldUpdateOrderId) {
            const data = {
                customFields: nextCustomFields,
            };
            if (orderIdResult.generated === true && orderIdResult.orderId) {
                data.controlNumber = orderIdResult.orderId;
            }

            await prisma.student.update({
                where: { id: student.id },
                data,
            });
            if (orderIdResult.generated === true && orderIdResult.orderId) {
                student.controlNumber = orderIdResult.orderId;
            }
            student.customFields = nextCustomFields;
            updated += 1;
        }
    }

    return updated;
}

async function backfillOrderIdsForAllStudents() {
    const settings = readSettings();
    const batchSize = 200;
    let cursorId = null;
    let updated = 0;
    let scanned = 0;

    while (true) {
        const students = await prisma.student.findMany({
            where: cursorId ? { id: { gt: cursorId } } : {},
            take: batchSize,
            orderBy: { id: 'asc' },
            select: {
                id: true,
                controlNumber: true,
                customFields: true,
            },
        });

        if (!students.length) break;

        scanned += students.length;
        updated += await applyOrderIdBackfill(students, settings);
        cursorId = students[students.length - 1].id;

        if (students.length < batchSize) break;
    }

    const rules = Array.isArray(settings.orderIdRules) ? settings.orderIdRules : [];
    return { scanned, updated, rulesCount: rules.length };
}

// Get distinct values of a specific customField key for imported records
// GET /students/meta/import-field-values?field=Regional+Center&batchId=123
router.get('/meta/import-field-values', async (req, res, next) => {
    try {
        const { field, batchId } = req.query;
        if (!field) return res.json({ success: true, data: [] });

        const escapedField = String(field).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        let rows;
        if (batchId) {
            rows = await prisma.$queryRawUnsafe(
                `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${escapedField}"')) AS val
                 FROM students
                 WHERE source = 'excel_import'
                   AND import_batch_id = ?
                   AND JSON_EXTRACT(custom_fields, '$."${escapedField}"') IS NOT NULL
                   AND JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${escapedField}"')) NOT IN ('null','')
                 ORDER BY val ASC LIMIT 300`,
                BigInt(batchId)
            );
        } else {
            rows = await prisma.$queryRawUnsafe(
                `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${escapedField}"')) AS val
                 FROM students
                 WHERE source = 'excel_import'
                   AND JSON_EXTRACT(custom_fields, '$."${escapedField}"') IS NOT NULL
                   AND JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${escapedField}"')) NOT IN ('null','')
                 ORDER BY val ASC LIMIT 300`
            );
        }

        const values = rows.map(r => r.val).filter(Boolean);
        res.json({ success: true, data: values });
    } catch (error) {
        next(error);
    }
});

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
                    if (k && k.trim() && !k.startsWith('_')) customFieldKeysSet.add(k.trim());
                });
            }
        });

        // Sort all arrays alphabetically
        const sortedProgrammes   = programmes.map(p => p.programme).filter(Boolean).sort((a, b) => a.localeCompare(b));
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

// Export records to CSV — true streaming, no in-memory build, handles any row count
router.get('/export/excel', async (req, res, next) => {
    try {
        const {
            search = '',
            source,
            importBatchId,
            status,
            programme,
            regionalCenter,
            subject,
        } = req.query;

        // ── Build where clause ───────────────────────────────────────────────────
        const where = {};

        if (source) {
            where.source = source;
        } else {
            where.source = { not: 'excel_import' };
        }

        if (importBatchId) where.importBatchId = BigInt(importBatchId);

        if (search) {
            where.OR = [
                { fullName: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
                { enrollmentNo: { contains: search } },
                { programme: { contains: search } },
                { course: { contains: search } },
                { regionalCenter: { contains: search } },
                { customFields: { string_contains: search } },
            ];
        }

        if (status)         where.status = status;
        if (programme)      where.programme = { equals: programme };
        if (regionalCenter) where.regionalCenter = { equals: regionalCenter };
        if (subject)        where.subjects = { array_contains: [subject] };

        // ── Custom field filters ─────────────────────────────────────────────────
        const customFieldFilters = req.query.customField;
        if (customFieldFilters && typeof customFieldFilters === 'object') {
            const cfFilterEntries = [];
            for (const [k, v] of Object.entries(customFieldFilters)) {
                if (!k || !v) continue;
                const values = String(v).split(',').map(s => s.trim()).filter(Boolean);
                if (values.length === 0) continue;
                cfFilterEntries.push({ key: k, values });
            }
            if (cfFilterEntries.length > 0) {
                const cfWhereParts = cfFilterEntries.map(({ key, values }) => {
                    const ek = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    return `JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$.\"${ek}\"')) IN (${values.map(() => '?').join(', ')})`;
                });
                const cfParams = cfFilterEntries.flatMap(({ values }) => values);
                const cfRows = await prisma.$queryRawUnsafe(
                    `SELECT id FROM students WHERE ${cfWhereParts.join(' AND ')}`,
                    ...cfParams
                );
                where.id = { in: cfRows.map(r => BigInt(r.id)) };
            }
        }

        // ── Grab first record to determine column order ──────────────────────────
        const firstRow = await prisma.student.findFirst({
            where,
            orderBy: { createdAt: 'desc' },
            select: { customFields: true },
        });

        if (!firstRow) {
            return res.status(404).json({ success: false, message: 'No records match the current filters.' });
        }

        const INTERNAL_KEYS = new Set(['_columnOrder']);
        const cfFirst = firstRow.customFields || {};
        const columnOrder = (Array.isArray(cfFirst._columnOrder) && cfFirst._columnOrder.length > 0)
            ? cfFirst._columnOrder
            : Object.keys(cfFirst);
        const visibleCols = columnOrder.filter(k => !INTERNAL_KEYS.has(k));

        // Helper: escape a single CSV cell value
        const csvCell = (val) => {
            if (val === null || val === undefined) return '';
            const s = Array.isArray(val) ? val.join(', ') : String(val);
            // Wrap in quotes if contains comma, quote, or newline
            if (s.includes('"') || s.includes(',') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };

        const filename = `export_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Transfer-Encoding', 'chunked');

        // Write UTF-8 BOM so Excel auto-detects encoding
        res.write('\uFEFF');

        // Write header row
        res.write(visibleCols.map(csvCell).join(',') + '\r\n');

        // ── Stream rows in batches of 1000 ───────────────────────────────────────
        const CHUNK = 1000;
        let offset = 0;

        while (true) {
            const rows = await prisma.student.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                select: { customFields: true },
                skip: offset,
                take: CHUNK,
            });

            if (rows.length === 0) break;

            let csvChunk = '';
            for (const row of rows) {
                const cf = row.customFields || {};
                csvChunk += visibleCols.map(col => csvCell(cf[col])).join(',') + '\r\n';
            }
            res.write(csvChunk);

            offset += rows.length;
            if (rows.length < CHUNK) break;

            // Yield event loop so other requests stay responsive
            await new Promise(resolve => setImmediate(resolve));
        }

        res.end();
    } catch (error) {
        // If headers already sent (streaming started), just close connection
        if (!res.headersSent) next(error);
        else res.end();
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
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
            return res.status(403).json({
                success: false,
                message: 'Only admins and managers can delete orders',
            });
        }

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

// Co-handle/take over an order. Telecallers can take an unclaimed co-handle slot;
// admins/managers can reassign the co-handler repeatedly when escalation is needed.
router.post('/co-handle/:id', async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'MANAGER';
        const isTelecaller = req.user.role === 'STAFF' && req.user.staffRole === 'TELECALLER';
        if (!isAdmin && !isTelecaller) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }

        const studentId = BigInt(req.params.id);
        const [student] = await prisma.$queryRaw`
            SELECT s.id, s.full_name as fullName, s.assigned_by_id as assignedById, s.co_handled_by_id as coHandledById,
                   s.custom_fields as customFields, s.created_by as createdById,
                   c.full_name as createdByName, c.role as createdByRole, c.staff_role as createdByStaffRole,
                   h.full_name as currentCoHandlerName, h.role as currentCoHandlerRole, h.staff_role as currentCoHandlerStaffRole
            FROM students s
            LEFT JOIN users c ON c.id = s.created_by
            LEFT JOIN users h ON h.id = s.co_handled_by_id
            WHERE s.id = ${studentId}
        `;

        if (!student) return res.status(404).json({ success: false, message: 'Order not found' });

        const requestedCoHandlerId = req.body?.coHandlerId ? parseInt(req.body.coHandlerId) : null;
        if (requestedCoHandlerId !== null && !Number.isInteger(requestedCoHandlerId)) {
            return res.status(400).json({ success: false, message: 'Invalid takeover user' });
        }

        if (requestedCoHandlerId && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Only admins and managers can reassign takeover owner' });
        }

        const nextCoHandlerId = requestedCoHandlerId || req.user.id;

        const coHandler = await prisma.user.findFirst({
            where: {
                id: nextCoHandlerId,
                status: 'ACTIVE',
                OR: [
                    { role: 'ADMIN' },
                    { role: 'MANAGER' },
                    { role: 'STAFF', staffRole: 'TELECALLER' },
                ],
            },
            select: { id: true, fullName: true, role: true, staffRole: true },
        });

        if (!coHandler) {
            return res.status(400).json({ success: false, message: 'Selected takeover user is not available' });
        }

        // Can't co-handle your own order
        if (student.assignedById === nextCoHandlerId || student.assignedById === BigInt(nextCoHandlerId)) {
            return res.status(400).json({ success: false, message: 'You are already the primary telecaller for this order' });
        }

        // Already has a co-handler. Staff must ask admin/manager to reassign.
        if (student.coHandledById && !isAdmin) {
            return res.status(400).json({ success: false, message: 'This order already has a co-handler. A 3rd handler requires admin approval.' });
        }

        const nextCustomFields = readCustomFieldObject(student.customFields);
        const existingOwners = Array.isArray(nextCustomFields[TELECALLER_OWNERS_FIELD])
            ? nextCustomFields[TELECALLER_OWNERS_FIELD]
            : [];
        const ownershipChain = uniqueTelecallerOwners([
            student.createdById ? {
                id: Number(student.createdById),
                name: student.createdByName,
                role: student.createdByRole,
                staffRole: student.createdByStaffRole,
                addedAt: new Date().toISOString(),
            } : null,
            ...existingOwners,
            student.coHandledById ? {
                id: Number(student.coHandledById),
                name: student.currentCoHandlerName,
                role: student.currentCoHandlerRole,
                staffRole: student.currentCoHandlerStaffRole,
                addedAt: new Date().toISOString(),
            } : null,
            {
                id: coHandler.id,
                name: coHandler.fullName,
                role: coHandler.role,
                staffRole: coHandler.staffRole,
                addedAt: new Date().toISOString(),
            },
        ]);

        nextCustomFields[TELECALLER_OWNERS_FIELD] = withEqualCommissionSplit(ownershipChain);

        await prisma.$transaction([
            prisma.$executeRaw`
                UPDATE students
                SET co_handled_by_id = ${nextCoHandlerId}, co_handled_at = NOW()
                WHERE id = ${studentId}
            `,
            prisma.student.update({
                where: { id: studentId },
                data: { customFields: nextCustomFields },
            }),
        ]);

        const ownerCount = nextCustomFields[TELECALLER_OWNERS_FIELD].length;
        const splitLabel = ownerCount > 1
            ? `${Number((100 / ownerCount).toFixed(2))}% each`
            : '100%';

        res.json({
            success: true,
            message: requestedCoHandlerId
                ? `Takeover assigned to ${coHandler.fullName}. Commission split updated to ${splitLabel}.`
                : `You are now co-handling this order. Commission split updated to ${splitLabel}.`,
            data: {
                coHandledById: coHandler.id,
                coHandledBy: {
                    id: coHandler.id,
                    fullName: coHandler.fullName,
                },
            },
        });
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
        const { guideId, forceDuplicate = false } = req.body;
        const parsedGuideId = guideId ? parseInt(guideId) : null;

        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: {
                customFields: true,
                fullName: true,
                programme: true,
                course: true,
                regionalCenter: true,
            },
        });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        if (parsedGuideId && !Number.isInteger(parsedGuideId)) {
            return res.status(400).json({ success: false, message: 'Invalid guide selected' });
        }

        if (parsedGuideId) {
            const programme = getStudentProgramme(student);
            const regionalCenter = getStudentRegionalCenter(student);

            if (programme && regionalCenter && !forceDuplicate) {
                const guide = await prisma.user.findUnique({
                    where: { id: parsedGuideId },
                    select: { fullName: true },
                });

                const assignedCandidates = await prisma.student.findMany({
                    where: {
                        id: { not: studentId },
                        assignedGuideId: parsedGuideId,
                        status: { not: 'ALL_DONE' },
                    },
                    select: {
                        id: true,
                        programme: true,
                        course: true,
                        regionalCenter: true,
                        customFields: true,
                    },
                });

                const normalizedProgramme = normalizeComparable(programme);
                const normalizedRegionalCenter = normalizeComparable(regionalCenter);
                const duplicateCount = assignedCandidates.filter(candidate => (
                    normalizeComparable(getStudentProgramme(candidate)) === normalizedProgramme &&
                    normalizeComparable(getStudentRegionalCenter(candidate)) === normalizedRegionalCenter
                )).length;

                if (duplicateCount >= 5) {
                    return res.status(409).json({
                        success: false,
                        code: 'DUPLICATE_ASSIGNMENT_WARNING',
                        message: `This order has the same RC (${regionalCenter}) and same Program (${programme}) already assigned to ${guide?.fullName || 'this member'} ${duplicateCount} times.Still want to continue ?`,
                        data: {
                            count: duplicateCount,
                            memberName: guide?.fullName || 'this member',
                            programme,
                            regionalCenter,
                        },
                    });
                }
            }
        }

        const nextCustomFields = student.customFields && typeof student.customFields === 'object'
            ? { ...student.customFields }
            : {};


        await prisma.$transaction([
            prisma.$executeRaw`UPDATE students SET assigned_guide_id = ${parsedGuideId}, assigned_by_id = ${parsedGuideId ? parseInt(req.user.id) : null} WHERE id = ${studentId}`,
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
        if (parsedGuideId) {
            await notify(io, {
                userIds: [parsedGuideId],
                type: 'STUDENT_ASSIGNED',
                title: 'Student Assigned to You',
                message: `${student.fullName || 'A student'} has been assigned to you.`,
                link: `/orders/${studentId}`,
            });
        }

        res.json({
            success: true,
            message: parsedGuideId ? 'Student assigned successfully' : 'Assignment removed',
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
        if (source) {
            if (source === '!excel_import') {
                where.source = { not: 'excel_import' };
            } else {
                where.source = source;
            }
        } else {
            // By default exclude excel_import records — they live only in import-preview
            where.source = { not: 'excel_import' };
        }

        // Support customField[FieldName]=value1,value2 for adaptive import-preview filters
        const customFieldFilters = req.query.customField;
        const cfFilterEntries = [];
        if (customFieldFilters && typeof customFieldFilters === 'object') {
            for (const [k, v] of Object.entries(customFieldFilters)) {
                if (!k || !v) continue;
                const values = String(v).split(',').map(s => s.trim()).filter(Boolean);
                if (values.length === 0) continue;
                cfFilterEntries.push({ key: k, values });
            }
        }

        // STAFF (guides/experts) only see students assigned to them
        // Use raw numeric filter — no Prisma relation needed
        const isTelecaller = req.user.role === 'STAFF' && req.user.staffRole === 'TELECALLER';
        if (req.user.role === 'STAFF' && !isTelecaller) {
            where.assignedGuideId = req.user.id;
        }

        // If custom field filters are present, get matching IDs via raw SQL first
        if (cfFilterEntries.length > 0) {
            // Build WHERE clauses for each cf filter using JSON_EXTRACT
            const cfWhereParts = cfFilterEntries.map(({ key, values }) => {
                const escapedKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                const placeholders = values.map(() => '?').join(', ');
                return `JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${escapedKey}"')) IN (${placeholders})`;
            });
            const cfParams = cfFilterEntries.flatMap(({ values }) => values);

            const cfRows = await prisma.$queryRawUnsafe(
                `SELECT id FROM students WHERE ${cfWhereParts.join(' AND ')}`,
                ...cfParams
            );
            const cfMatchingIds = cfRows.map(r => Number(r.id));

            // Intersect with any existing id filter
            if (where.id && where.id.in) {
                where.id.in = where.id.in.filter(id => cfMatchingIds.includes(Number(id)));
            } else {
                where.id = { in: cfMatchingIds.map(id => BigInt(id)) };
            }
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
                controlNumber: true,
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

        await applyOrderIdBackfill(students, readSettings());

        // Get student IDs (as numbers for raw SQL)
        const studentIds = students.map(s => s.id);

        // Fetch the assigned_guide_id column + guide info via raw SQL (bypass Prisma client type limit)
        let guideMap = {};
        if (studentIds.length > 0) {
            const rows = await prisma.$queryRaw`
                SELECT s.id, s.assigned_guide_id, s.assigned_by_id, s.created_by, s.co_handled_by_id,
                       u.id as guide_id, u.full_name as guide_name,
                       u.staff_role as guide_staff_role, u.degree as guide_degree,
                       a.id as assigner_id, a.full_name as assigner_name, a.staff_role as assigner_staff_role,
                       c.id as creator_id, c.full_name as creator_name, c.staff_role as creator_staff_role,
                       h.id as cohandler_id, h.full_name as cohandler_name
                FROM students s
                LEFT JOIN users u ON u.id = s.assigned_guide_id
                LEFT JOIN users a ON a.id = s.assigned_by_id
                LEFT JOIN users c ON c.id = s.created_by
                LEFT JOIN users h ON h.id = s.co_handled_by_id
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
                    createdById: row.created_by ? Number(row.created_by) : null,
                    createdBy: row.creator_id ? {
                        id: Number(row.creator_id),
                        fullName: row.creator_name,
                        staffRole: row.creator_staff_role,
                    } : null,
                    coHandledById: row.co_handled_by_id ? Number(row.co_handled_by_id) : null,
                    coHandledBy: row.cohandler_id ? {
                        id: Number(row.cohandler_id),
                        fullName: row.cohandler_name,
                    } : null,
                };
            });
        }

        // Merge guide info back into student records
        const serializedStudents = students.map(s => ({
            ...s,
            id: s.id.toString(),
            orderId: getGeneratedOrderId(s),
            ...(guideMap[s.id.toString()] || { assignedGuideId: null, assignedGuide: null, assignedById: null, assignedBy: null, createdById: null, createdBy: null, coHandledById: null, coHandledBy: null }),
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

router.post('/backfill-order-ids', async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
            return res.status(403).json({
                success: false,
                message: 'Only admins and managers can backfill order IDs',
            });
        }

        const result = await backfillOrderIdsForAllStudents();

        res.json({
            success: true,
            message: 'Order IDs backfilled successfully',
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

// Get student by ID
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const studentId = BigInt(id);

        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: {
                lead: {
                    select: {
                        id: true,
                        stage: true,
                        source: true,
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

        await applyOrderIdBackfill([student]);

        // Fetch creator + co-handler via raw SQL (Prisma client may not have these relations yet)
        const [extra] = await prisma.$queryRaw`
            SELECT c.id as creator_id, c.full_name as creator_name,
                   h.id as cohandler_id, h.full_name as cohandler_name
            FROM students s
            LEFT JOIN users c ON c.id = s.created_by
            LEFT JOIN users h ON h.id = s.co_handled_by_id
            WHERE s.id = ${studentId}
        `;

        const serializedStudent = {
            ...student,
            id: student.id.toString(),
            orderId: getGeneratedOrderId(student),
            leadId: student.leadId?.toString(),
            importBatchId: student.importBatchId?.toString(),
            lead: student.lead ? {
                ...student.lead,
                id: student.lead.id.toString(),
            } : null,
            createdBy: extra?.creator_id ? {
                id: Number(extra.creator_id),
                fullName: extra.creator_name,
            } : null,
            coHandledBy: extra?.cohandler_id ? {
                id: Number(extra.cohandler_id),
                fullName: extra.cohandler_name,
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

        const orderIdResult = await ensureOrderIdForCustomFields(prisma, customFields || {}, null, null, readSettings());

        const student = await prisma.student.create({
            data: {
                enrollmentNo: enrollmentNo || null,
                controlNumber: orderIdResult.orderId || null,
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
                customFields: Object.keys(orderIdResult.customFields).length > 0 ? orderIdResult.customFields : null,
            },
        });

        res.status(201).json({
            success: true,
            message: 'Student created successfully',
            data: {
                ...student,
                id: student.id.toString(),
                orderId: getGeneratedOrderId(student),
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
        const existingStudent = await prisma.student.findUnique({
            where: { id: BigInt(id) },
            select: { customFields: true, controlNumber: true },
        });

        if (!existingStudent) {
            return res.status(404).json({
                success: false,
                message: 'Student not found',
            });
        }

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

        if (updateData.customFields !== undefined) {
            const orderIdResult = await ensureOrderIdForCustomFields(
                prisma,
                updateData.customFields,
                existingStudent.customFields,
                existingStudent.controlNumber,
                readSettings(),
            );
            updateData.customFields = Object.keys(orderIdResult.customFields).length > 0 ? orderIdResult.customFields : null;
            updateData.controlNumber = orderIdResult.orderId || updateData.controlNumber || existingStudent.controlNumber || null;
        }

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
                orderId: getGeneratedOrderId(student),
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

// Promote a single imported student row to the main orders page
router.post('/promote-import/:id', async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'MANAGER';
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }

        const studentId = BigInt(req.params.id);
        const student = await prisma.student.findUnique({
            where: { id: studentId }
        });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        if (student.source !== 'excel_import') {
            return res.status(400).json({ success: false, message: 'Record is not an imported record' });
        }

        const updated = await prisma.student.update({
            where: { id: studentId },
            data: {
                source: 'manual',
                importBatchId: null
            }
        });

        res.json({
            success: true,
            message: 'Record promoted to orders',
            data: {
                ...updated,
                id: updated.id.toString(),
            }
        });
    } catch (error) {
        next(error);
    }
});

// Promote all imported rows from a specific batch to the main orders page
router.post('/promote-import-batch/:importBatchId', async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'MANAGER';
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }

        const batchId = BigInt(req.params.importBatchId);

        const result = await prisma.student.updateMany({
            where: { 
                importBatchId: batchId,
                source: 'excel_import'
            },
            data: {
                source: 'manual',
                importBatchId: null
            }
        });

        res.json({
            success: true,
            message: `Successfully promoted ${result.count} records to orders`,
            data: {
                count: result.count
            }
        });
    } catch (error) {
        next(error);
    }
});

export default router;
