import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import prisma from '../config/database.js';
import { mapHeaders, learnMappings, resultsToSuggestedMappings } from '../services/smartMapper.js';
import { notify, getAdminIds } from '../services/notificationService.js';
import { ensureOrderIdForCustomFields } from '../services/orderIdService.js';
import { readSettings } from './appSettingsRoutes.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `import-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
        ];
        if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel/CSV files are allowed'), false);
        }
    },
});

// Upload and preview file
router.post('/upload', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded',
            });
        }

        const { importType = 'STUDENTS' } = req.body;

        // Read Excel file
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Get headers
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const headers = jsonData[0] || [];
        const totalRows = jsonData.length - 1; // Exclude header row

        // Get preview data (first 10 rows)
        const previewData = XLSX.utils.sheet_to_json(worksheet).slice(0, 10);

        // Create import history record
        const importHistory = await prisma.importHistory.create({
            data: {
                fileName: req.file.originalname,
                filePath: req.file.path,
                fileSize: BigInt(req.file.size),
                importType,
                totalRecords: totalRows,
                status: 'PENDING',
                importedById: req.user.id,
            },
        });

        // ── Smart auto-mapping ──────────────────────────────────────────────
        // Use first 5 data rows for type sniffing
        const previewRows = jsonData.slice(1, 6);
        const mappingResults = mapHeaders(headers, previewRows, importType);
        const suggestedMappings = resultsToSuggestedMappings(mappingResults);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: {
                importId: importHistory.id.toString(),
                fileName: req.file.originalname,
                filePath: req.file.path,
                totalRows,
                headers,
                previewData,
                suggestedMappings,
                // Enriched mapping results for the smart UI
                mappingResults,
                availableFields: importType === 'STUDENTS'
                    ? ['controlNumber', 'enrollmentNo', 'fullName', 'email', 'alternateEmail', 'phone', 'alternatePhone', 'programme', 'course', 'specialization', 'regionalCenter', 'batchYear', 'semester', 'subjects', 'address', 'city', 'state', 'pincode', 'gender', 'dateOfBirth', 'admissionDate']
                    : ['fullName', 'email', 'phone', 'alternatePhone', 'interestedCourse', 'source', 'priority', 'sourceDetails'],
            },
        });
    } catch (error) {
        next(error);
    }
});

// Resume pending import
router.get('/resume/:importId', async (req, res, next) => {
    try {
        const { importId } = req.params;

        // Get the import record
        const importRecord = await prisma.importHistory.findUnique({
            where: { id: BigInt(importId) },
        });

        if (!importRecord) {
            return res.status(404).json({
                success: false,
                message: 'Import record not found',
            });
        }

        // Only allow resuming PENDING imports
        if (importRecord.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: 'Can only resume pending imports',
            });
        }

        // Check if file exists
        if (!importRecord.filePath || !fs.existsSync(importRecord.filePath)) {
            // Mark as failed since file is missing
            await prisma.importHistory.update({
                where: { id: BigInt(importId) },
                data: { status: 'FAILED', errorLog: [{ error: 'File not found on server' }] },
            });
            return res.status(400).json({
                success: false,
                message: 'File no longer exists on server. Please upload again.',
            });
        }

        // Re-read the file
        const workbook = XLSX.readFile(importRecord.filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Get headers
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const headers = jsonData[0] || [];
        const totalRows = jsonData.length - 1;

        // Get preview data
        const previewData = XLSX.utils.sheet_to_json(worksheet).slice(0, 10);

        // ── Smart auto-mapping ──────────────────────────────────────────────
        const previewRows = jsonData.slice(1, 6);
        const mappingResults = mapHeaders(headers, previewRows, importRecord.importType);
        const suggestedMappings = resultsToSuggestedMappings(mappingResults);

        res.json({
            success: true,
            message: 'Import resumed successfully',
            data: {
                importId: importRecord.id.toString(),
                fileName: importRecord.fileName,
                filePath: importRecord.filePath,
                totalRows,
                headers,
                previewData,
                suggestedMappings,
                mappingResults,
                importType: importRecord.importType,
                availableFields: importRecord.importType === 'STUDENTS'
                    ? ['controlNumber', 'enrollmentNo', 'fullName', 'email', 'alternateEmail', 'phone', 'alternatePhone', 'programme', 'course', 'specialization', 'regionalCenter', 'batchYear', 'semester', 'subjects', 'address', 'city', 'state', 'pincode', 'gender', 'dateOfBirth', 'admissionDate']
                    : ['fullName', 'email', 'phone', 'alternatePhone', 'interestedCourse', 'source', 'priority', 'sourceDetails'],
            },
        });
    } catch (error) {
        next(error);
    }
});

// Process import with column mapping
router.post('/process/:importId', async (req, res, next) => {
    try {
        const { importId } = req.params;
        const { columnMapping, duplicateHandling = 'skip', filePath } = req.body;

        if (!columnMapping || Object.keys(columnMapping).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Column mapping is required',
            });
        }

        // Get import record
        const importRecord = await prisma.importHistory.findUnique({
            where: { id: BigInt(importId) },
        });

        if (!importRecord) {
            return res.status(404).json({
                success: false,
                message: 'Import record not found',
            });
        }

        // Update status to processing
        await prisma.importHistory.update({
            where: { id: BigInt(importId) },
            data: {
                status: 'PROCESSING',
                startedAt: new Date(),
                columnMapping,
            },
        });

        // Read file
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const headers = jsonData[0];
        const dataRows = jsonData.slice(1);

        // Get Socket.IO instance
        const io = req.app.get('io');

        let imported = 0;
        let updated = 0;
        let skipped = 0;
        let failed = 0;
        const errors = [];
        const BATCH_SIZE = 2000; // Larger batches for bulk insert

        // Process in batches - prepare data first, then bulk insert
        for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
            const batch = dataRows.slice(i, i + BATCH_SIZE);
            const studentsToCreate = [];
            const leadsToCreate = [];

            for (let rowIdx = 0; rowIdx < batch.length; rowIdx++) {
                const row = batch[rowIdx];
                const absoluteRowIdx = i + rowIdx;

                try {
                    // Map columns to data
                    const mappedData = {};
                    const subjectsArray = []; // Collect all subject values
                    const importedCustomFields = {}; // Collect customField.* columns

                    // Store all original columns as customFields to retain exact sheet layout
                    headers.forEach((header, index) => {
                        const value = row[index];
                        if (value !== undefined && value !== null && value !== '' && header) {
                            importedCustomFields[String(header).trim()] = value.toString().trim();
                        }
                    });

                    // Preserve the original column order as an array so the UI can
                    // reconstruct the exact sheet order even after MySQL JSON key reordering
                    const validHeaders = headers.filter(h => h && String(h).trim());
                    if (validHeaders.length > 0) {
                        importedCustomFields['_columnOrder'] = validHeaders.map(h => String(h).trim());
                    }

                    Object.entries(columnMapping).forEach(([colIndex, fieldName]) => {
                        const value = row[parseInt(colIndex)];
                        if (value !== undefined && value !== null && value !== '') {
                            // customField.* — store in importedCustomFields object
                            if (fieldName && fieldName.startsWith('customField.')) {
                                const cfKey = fieldName.replace('customField.', '');
                                importedCustomFields[cfKey] = value.toString().trim();
                            } else if (fieldName === 'subjects') {
                                subjectsArray.push(value.toString().trim());
                            } else {
                                mappedData[fieldName] = value;
                            }
                        }
                    });

                    // Add subjects array if any were collected
                    if (subjectsArray.length > 0) {
                        mappedData.subjects = subjectsArray.filter(s => s);
                    }

                    // Merge any custom fields into mappedData
                    if (Object.keys(importedCustomFields).length > 0) {
                        mappedData.customFields = importedCustomFields;
                    }

                    // Skip empty rows
                    if (Object.keys(mappedData).length === 0) {
                        skipped++;
                        continue;
                    }

                    // Auto-generate name fallback — never fail a row just because
                    // the name cell is empty. Use the best available identifier.
                    if (!mappedData.fullName) {
                        const fallback =
                            mappedData.enrollmentNo   ? `Student-${mappedData.enrollmentNo}` :
                            mappedData.controlNumber  ? `Student-${mappedData.controlNumber}` :
                            mappedData.phone          ? `Student-${mappedData.phone}` :
                            mappedData.email          ? `Student-${mappedData.email.split('@')[0]}` :
                            `Student-Row${absoluteRowIdx + 2}`;
                        mappedData.fullName = fallback;
                    }


                    // Convert string fields (in case they come as numbers from Excel)
                    if (mappedData.enrollmentNo !== undefined) {
                        const val = String(mappedData.enrollmentNo).trim();
                        mappedData.enrollmentNo = val && val !== 'undefined' && val !== 'null' ? val : null;
                    }
                    if (mappedData.controlNumber !== undefined) {
                        const val = String(mappedData.controlNumber).trim();
                        mappedData.controlNumber = val && val !== 'undefined' && val !== 'null' ? val : null;
                    }
                    if (mappedData.phone !== undefined) {
                        const val = String(mappedData.phone).trim();
                        mappedData.phone = val && val !== 'undefined' && val !== 'null' ? val : null;
                    }
                    if (mappedData.email !== undefined) {
                        const val = String(mappedData.email).trim();
                        mappedData.email = val && val !== 'undefined' && val !== 'null' ? val : null;
                    }
                    if (mappedData.alternateEmail !== undefined) {
                        const val = String(mappedData.alternateEmail).trim();
                        mappedData.alternateEmail = val && val !== 'undefined' && val !== 'null' ? val : null;
                    }
                    if (mappedData.alternatePhone !== undefined) {
                        const val = String(mappedData.alternatePhone).trim();
                        mappedData.alternatePhone = val && val !== 'undefined' && val !== 'null' ? val : null;
                    }
                    if (mappedData.fullName !== undefined) {
                        mappedData.fullName = String(mappedData.fullName).trim();
                    }
                    if (mappedData.programme !== undefined) {
                        mappedData.programme = String(mappedData.programme).trim();
                    }
                    if (mappedData.course !== undefined) {
                        mappedData.course = String(mappedData.course).trim();
                    }
                    if (mappedData.regionalCenter !== undefined) {
                        mappedData.regionalCenter = String(mappedData.regionalCenter).trim();
                    }
                    if (mappedData.city !== undefined) {
                        mappedData.city = String(mappedData.city).trim();
                    }
                    if (mappedData.state !== undefined) {
                        mappedData.state = String(mappedData.state).trim();
                    }
                    if (mappedData.address !== undefined) {
                        mappedData.address = String(mappedData.address).trim();
                    }
                    if (mappedData.pincode !== undefined) {
                        mappedData.pincode = String(mappedData.pincode).trim();
                    }
                    if (mappedData.gender !== undefined) {
                        mappedData.gender = String(mappedData.gender).trim();
                    }

                    // Convert data types
                    if (mappedData.batchYear) {
                        mappedData.batchYear = parseInt(mappedData.batchYear) || null;
                    }
                    if (mappedData.semester) {
                        mappedData.semester = parseInt(mappedData.semester) || null;
                    }
                    if (mappedData.dateOfBirth) {
                        const date = new Date(mappedData.dateOfBirth);
                        mappedData.dateOfBirth = isNaN(date.getTime()) ? null : date;
                    }
                    if (mappedData.admissionDate) {
                        const date = new Date(mappedData.admissionDate);
                        mappedData.admissionDate = isNaN(date.getTime()) ? null : date;
                    }

                    // Remove null/undefined values
                    Object.keys(mappedData).forEach(key => {
                        const val = mappedData[key];
                        if (val === null || val === undefined || val === '') {
                            if (key !== 'subjects') {
                                delete mappedData[key];
                            }
                        }
                    });

                    // Ensure subjects is stored properly as JSON
                    if (mappedData.subjects && Array.isArray(mappedData.subjects)) {
                        mappedData.subjects = mappedData.subjects.filter(s => s && s.trim());
                        if (mappedData.subjects.length === 0) {
                            delete mappedData.subjects;
                        }
                    }

                    if (importRecord.importType === 'STUDENTS') {
                        // Prepare student data
                        const studentData = {
                            fullName: mappedData.fullName || 'Unknown',
                            source: 'excel_import',
                            importBatchId: BigInt(importId),
                            createdById: req.user.id,
                        };

                        // Add optional standard fields
                        if (mappedData.enrollmentNo) studentData.enrollmentNo = mappedData.enrollmentNo;
                        if (mappedData.controlNumber) studentData.controlNumber = mappedData.controlNumber;
                        if (mappedData.email) studentData.email = mappedData.email;
                        if (mappedData.alternateEmail) studentData.alternateEmail = mappedData.alternateEmail;
                        if (mappedData.phone) studentData.phone = mappedData.phone;
                        if (mappedData.alternatePhone) studentData.alternatePhone = mappedData.alternatePhone;
                        if (mappedData.programme) studentData.programme = mappedData.programme;
                        if (mappedData.course) studentData.course = mappedData.course;
                        if (mappedData.regionalCenter) studentData.regionalCenter = mappedData.regionalCenter;
                        if (mappedData.city) studentData.city = mappedData.city;
                        if (mappedData.state) studentData.state = mappedData.state;
                        if (mappedData.address) studentData.address = mappedData.address;
                        if (mappedData.pincode) studentData.pincode = mappedData.pincode;
                        if (mappedData.gender) studentData.gender = mappedData.gender;
                        if (mappedData.batchYear) studentData.batchYear = mappedData.batchYear;
                        if (mappedData.semester) studentData.semester = mappedData.semester;
                        if (mappedData.dateOfBirth) studentData.dateOfBirth = mappedData.dateOfBirth;
                        if (mappedData.subjects && mappedData.subjects.length > 0) studentData.subjects = mappedData.subjects;

                        // Merge custom fields (from customField.* mapped columns)
                        if (mappedData.customFields && Object.keys(mappedData.customFields).length > 0) {
                            studentData.customFields = mappedData.customFields;
                        }

                        const orderIdResult = await ensureOrderIdForCustomFields(prisma, studentData.customFields || {}, null, null, readSettings());
                        if (orderIdResult.orderId) {
                            studentData.controlNumber = studentData.controlNumber || orderIdResult.orderId;
                        }
                        if (Object.keys(orderIdResult.customFields).length > 0) {
                            studentData.customFields = orderIdResult.customFields;
                        }

                        studentsToCreate.push(studentData);
                    } else {
                        // Import leads - Convert source to enum format
                        const sourceMap = {
                            'website': 'WEBSITE',
                            'referral': 'REFERRAL',
                            'social media': 'SOCIAL_MEDIA',
                            'socialmedia': 'SOCIAL_MEDIA',
                            'walk in': 'WALK_IN',
                            'walkin': 'WALK_IN',
                            'phone inquiry': 'PHONE_INQUIRY',
                            'phoneinquiry': 'PHONE_INQUIRY',
                            'phone': 'PHONE_INQUIRY',
                            'manual': 'MANUAL',
                            'excel import': 'EXCEL_IMPORT',
                            'other': 'OTHER',
                        };

                        const priorityMap = {
                            'low': 'LOW',
                            'medium': 'MEDIUM',
                            'high': 'HIGH',
                            'urgent': 'URGENT',
                        };

                        let sourceValue = 'MANUAL';
                        if (mappedData.source) {
                            const normalizedSource = mappedData.source.toString().toLowerCase().trim();
                            sourceValue = sourceMap[normalizedSource] || 'MANUAL';
                        }

                        let priorityValue = 'MEDIUM';
                        if (mappedData.priority) {
                            const normalizedPriority = mappedData.priority.toString().toLowerCase().trim();
                            priorityValue = priorityMap[normalizedPriority] || 'MEDIUM';
                        }

                        const leadData = {
                            fullName: mappedData.fullName,
                            email: mappedData.email || null,
                            phone: mappedData.phone || null,
                            alternatePhone: mappedData.alternatePhone || null,
                            interestedCourse: mappedData.interestedCourse || null,
                            source: sourceValue,
                            priority: priorityValue,
                            sourceDetails: mappedData.sourceDetails || null,
                            createdById: req.user.id,
                            importBatchId: BigInt(importId), // Add importBatchId for leads as well
                        };

                        leadsToCreate.push(leadData);
                    }
                } catch (error) {
                    errors.push({ row: absoluteRowIdx + 2, error: error.message });
                    failed++;
                }
            }

            // Bulk insert students
            if (studentsToCreate.length > 0) {
                try {
                    const result = await prisma.student.createMany({
                        data: studentsToCreate,
                        skipDuplicates: duplicateHandling === 'skip', // Skip if enrollment already exists
                    });
                    imported += result.count;
                    skipped += studentsToCreate.length - result.count; // Difference is skipped duplicates
                } catch (bulkError) {
                    // If bulk insert fails, try individually (slower fallback)
                    console.log('Bulk insert failed, falling back to individual inserts:', bulkError.message);
                    for (const studentData of studentsToCreate) {
                        try {
                            await prisma.student.create({ data: studentData });
                            imported++;
                        } catch (createError) {
                            if (createError.code === 'P2002') {
                                skipped++;
                            } else {
                                failed++;
                            }
                        }
                    }
                }
            }

            // Bulk insert leads
            if (leadsToCreate.length > 0) {
                try {
                    const result = await prisma.lead.createMany({
                        data: leadsToCreate,
                        skipDuplicates: duplicateHandling === 'skip',
                    });
                    imported += result.count;
                    skipped += leadsToCreate.length - result.count;
                } catch (bulkError) {
                    console.log('Bulk lead insert failed:', bulkError.message);
                    for (const leadData of leadsToCreate) {
                        try {
                            await prisma.lead.create({ data: leadData });
                            imported++;
                        } catch (createError) {
                            if (createError.code === 'P2002') {
                                skipped++;
                            } else {
                                failed++;
                            }
                        }
                    }
                }
            }

            // Emit progress update via Socket.IO
            const progressPercent = Math.round(((i + batch.length) / dataRows.length) * 100);
            console.log(`Import ${importId} progress: ${progressPercent}% (imported: ${imported}, skipped: ${skipped}, failed: ${failed})`);

            io.to(`import-${importId}`).emit('import-progress', {
                importId,
                progress: progressPercent,
                imported,
                updated,
                skipped,
                failed,
            });

            // Update database periodically (every 2 batches or last batch) for polling fallback
            if (i % (BATCH_SIZE * 2) === 0 || i + batch.length >= dataRows.length) {
                await prisma.importHistory.update({
                    where: { id: BigInt(importId) },
                    data: {
                        importedCount: imported,
                        updatedCount: updated,
                        skippedCount: skipped,
                        failedCount: failed,
                    },
                });
            }
        }

        // Update import record
        await prisma.importHistory.update({
            where: { id: BigInt(importId) },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                importedCount: imported,
                updatedCount: updated,
                skippedCount: skipped,
                failedCount: failed,
                errorLog: errors.length > 0 ? errors.slice(0, 100) : null, // Store first 100 errors
            },
        });

        // Emit completion
        io.to(`import-${importId}`).emit('import-complete', {
            importId,
            imported,
            updated,
            skipped,
            failed,
        });

        // Notify uploader + all admins
        const adminIds = await getAdminIds();
        const notifyIds = [...new Set([importRecord.importedById, ...adminIds].filter(Boolean))];
        const typeName = importRecord.importType === 'STUDENTS' ? 'Orders' : 'Leads';
        await notify(io, {
            userIds: notifyIds,
            type: 'IMPORT_DONE',
            title: `${typeName} Import Completed`,
            message: `${imported} ${typeName.toLowerCase()} imported, ${skipped} skipped, ${failed} failed.`,
            link: importRecord.importType === 'STUDENTS' ? '/orders' : '/leads',
        });

        // Clean up file
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            console.error('Error deleting file:', e);
        }

        res.json({
            success: true,
            message: 'Import completed',
            data: {
                imported,
                updated,
                skipped,
                failed,
                errors: errors.slice(0, 20), // Return first 20 errors
            },
        });
    } catch (error) {
        next(error);
    }
});

// ── Save confirmed column mappings to learning memory ─────────────────────────
router.post('/save-mapping', async (req, res, next) => {
    try {
        const { confirmedMappings } = req.body;
        // confirmedMappings: { [originalHeader: string]: fieldName: string }
        if (!confirmedMappings || typeof confirmedMappings !== 'object') {
            return res.status(400).json({ success: false, message: 'confirmedMappings object is required' });
        }
        learnMappings(confirmedMappings);
        res.json({ success: true, message: `Learned ${Object.keys(confirmedMappings).length} column mappings` });
    } catch (error) {
        next(error);
    }
});

// Get import history
router.get('/history', async (req, res, next) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const [total, imports] = await Promise.all([
            prisma.importHistory.count(),
            prisma.importHistory.findMany({
                skip,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
                include: {
                    importedBy: {
                        select: { id: true, fullName: true },
                    },
                },
            }),
        ]);

        const serializedImports = imports.map(imp => ({
            ...imp,
            id: imp.id.toString(),
            fileSize: imp.fileSize?.toString(),
        }));

        res.json({
            success: true,
            data: {
                imports: serializedImports,
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

// Delete import and optionally its records
router.delete('/history/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { deleteRecords = false } = req.query; // If true, also delete imported students

        const importRecord = await prisma.importHistory.findUnique({
            where: { id: BigInt(id) },
        });

        if (!importRecord) {
            return res.status(404).json({
                success: false,
                message: 'Import record not found',
            });
        }

        let deletedOrdersCount = 0;

        // If deleteRecords is true and import was completed, delete the imported records
        if (deleteRecords === 'true' && importRecord.status === 'COMPLETED') {
            // Delete all records that were imported with this batch
            const result = await prisma.student.deleteMany({
                where: { importBatchId: BigInt(id) },
            });
            deletedOrdersCount = result.count;
        }

        // Delete the import record (for PENDING/FAILED/PROCESSING) or with records for COMPLETED
        if (['PENDING', 'FAILED', 'PROCESSING'].includes(importRecord.status) || deleteRecords === 'true') {
            // First, unlink any remaining records from this batch (in case deleteRecords wasn't set)
            await prisma.student.updateMany({
                where: { importBatchId: BigInt(id) },
                data: { importBatchId: null },
            });

            // Then delete the import record
            await prisma.importHistory.delete({
                where: { id: BigInt(id) },
            });

            res.json({
                success: true,
                message: deleteRecords === 'true'
                    ? `Import and ${deletedOrdersCount} records deleted successfully`
                    : 'Import record deleted successfully',
                data: { deletedOrdersCount },
            });
        } else {
            // For completed imports without deleteRecords, don't allow deletion
            return res.status(400).json({
                success: false,
                message: 'To delete a completed import, set deleteRecords=true to also remove imported data',
            });
        }
    } catch (error) {
        next(error);
    }
});

// Get import details
router.get('/history/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const importRecord = await prisma.importHistory.findUnique({
            where: { id: BigInt(id) },
            include: {
                importedBy: {
                    select: { id: true, fullName: true },
                },
            },
        });

        if (!importRecord) {
            return res.status(404).json({
                success: false,
                message: 'Import record not found',
            });
        }

        res.json({
            success: true,
            data: {
                ...importRecord,
                id: importRecord.id.toString(),
                fileSize: importRecord.fileSize?.toString(),
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
