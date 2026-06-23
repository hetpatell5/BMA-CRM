import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
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
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const { importType = 'STUDENTS' } = req.body;
        const isCSV = /\.csv$/i.test(req.file.originalname) || req.file.mimetype === 'text/csv';

        let headers = [];
        let totalRows = 0;
        let previewData = [];   // first 10 rows as [{col: val}]
        let previewRows = [];   // first 5 rows as arrays (for smart mapper)

        if (isCSV) {
            // ── Streaming CSV parse — O(1) memory regardless of file size ──────────
            // Parse a single RFC-4180 CSV line into an array of strings
            const parseCSVLine = (line) => {
                const result = [];
                let cur = '';
                let inQ = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (inQ) {
                        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                        else if (ch === '"') { inQ = false; }
                        else { cur += ch; }
                    } else {
                        if (ch === '"') { inQ = true; }
                        else if (ch === ',') { result.push(cur); cur = ''; }
                        else { cur += ch; }
                    }
                }
                result.push(cur);
                return result;
            };

            const rl = readline.createInterface({
                input: fs.createReadStream(req.file.path, { encoding: 'utf8' }),
                crlfDelay: Infinity,
            });

            let headerParsed = false;
            for await (const line of rl) {
                // Strip UTF-8 BOM if present on first line
                const cleanLine = headerParsed ? line : line.replace(/^\uFEFF/, '');
                if (!cleanLine.trim()) continue;

                if (!headerParsed) {
                    headers = parseCSVLine(cleanLine);
                    headerParsed = true;
                } else {
                    totalRows++;
                    if (totalRows <= 10) {
                        const vals = parseCSVLine(line);
                        const obj = {};
                        headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : ''; });
                        previewData.push(obj);
                    }
                    if (totalRows <= 5) {
                        previewRows.push(parseCSVLine(line));
                    }
                }
            }
        } else {
            // ── Standard XLSX/XLS path (unchanged) ───────────────────────────────
            const workbook = XLSX.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            headers   = jsonData[0] || [];
            totalRows = jsonData.length - 1;
            previewData = XLSX.utils.sheet_to_json(worksheet).slice(0, 10);
            previewRows = jsonData.slice(1, 6);
        }

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

        // ── Smart auto-mapping ────────────────────────────────────────────────────
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

        const filePath = importRecord.filePath;
        const isCSVResume = /\.csv$/i.test(filePath) || importRecord.fileName?.toLowerCase().endsWith('.csv');

        let headers = [];
        let totalRows = 0;
        let previewData = [];
        let previewRows = [];

        if (isCSVResume) {
            const parseCSVLine = (line) => {
                const result = [];
                let cur = '';
                let inQ = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (inQ) {
                        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                        else if (ch === '"') { inQ = false; }
                        else { cur += ch; }
                    } else {
                        if (ch === '"') { inQ = true; }
                        else if (ch === ',') { result.push(cur); cur = ''; }
                        else { cur += ch; }
                    }
                }
                result.push(cur);
                return result;
            };

            const rl = readline.createInterface({
                input: fs.createReadStream(filePath, { encoding: 'utf8' }),
                crlfDelay: Infinity,
            });

            let headerParsed = false;
            for await (const line of rl) {
                const cleanLine = headerParsed ? line : line.replace(/^\uFEFF/, '');
                if (!cleanLine.trim()) continue;
                if (!headerParsed) {
                    headers = parseCSVLine(cleanLine);
                    headerParsed = true;
                } else {
                    totalRows++;
                    if (totalRows <= 10) {
                        const vals = parseCSVLine(line);
                        const obj = {};
                        headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : ''; });
                        previewData.push(obj);
                    }
                    if (totalRows <= 5) previewRows.push(parseCSVLine(line));
                }
            }
        } else {
            // XLSX/XLS
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            headers   = jsonData[0] || [];
            totalRows = jsonData.length - 1;
            previewData = XLSX.utils.sheet_to_json(worksheet).slice(0, 10);
            previewRows = jsonData.slice(1, 6);
        }

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

        // Security: ensure filePath is inside the uploads directory (prevent path traversal)
        const resolvedPath = path.resolve(filePath || '');
        const uploadsDir = path.resolve('./uploads');
        if (!filePath || !resolvedPath.startsWith(uploadsDir)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid file path',
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

        // Read file — use streaming CSV parser for .csv files to avoid OOM
        const filePath2 = filePath;
        const isCSVFile = /\.csv$/i.test(filePath2);
        let headers;
        let dataRows;

        if (isCSVFile) {
            const parseCSVLine = (line) => {
                const result = [];
                let cur = '';
                let inQ = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (inQ) {
                        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                        else if (ch === '"') { inQ = false; }
                        else { cur += ch; }
                    } else {
                        if (ch === '"') { inQ = true; }
                        else if (ch === ',') { result.push(cur); cur = ''; }
                        else { cur += ch; }
                    }
                }
                result.push(cur);
                return result;
            };

            const rl = readline.createInterface({
                input: fs.createReadStream(filePath2, { encoding: 'utf8' }),
                crlfDelay: Infinity,
            });

            headers = null;
            dataRows = [];
            for await (const line of rl) {
                const cleanLine = headers ? line : line.replace(/^\uFEFF/, '');
                if (!cleanLine.trim()) continue;
                if (!headers) {
                    headers = parseCSVLine(cleanLine);
                } else {
                    dataRows.push(parseCSVLine(line));
                }
            }
        } else {
            const workbook = XLSX.readFile(filePath2);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            headers  = jsonData[0];
            dataRows = jsonData.slice(1);
        }

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

                        // For excel imports the Control Number comes from the sheet — skip the
                        // per-row order-ID generator (it's a major speed bottleneck at 380k rows).
                        // The orderIdService is still called for manual/form_submission records.

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
        const { deleteRecords = false } = req.query;

        const importRecord = await prisma.importHistory.findUnique({
            where: { id: BigInt(id) },
        });

        if (!importRecord) {
            return res.status(404).json({ success: false, message: 'Import record not found' });
        }

        if (deleteRecords === 'true' && importRecord.status === 'COMPLETED') {
            // ─── Fire-and-forget background deletion ────────────────────────────────
            // Response is sent immediately — deletion runs fully in background.
            // Single DELETE with no LIMIT — removes every row for this batch.

            // Security: ensure batchId is a safe integer before using in raw SQL
            const batchIdNum = parseInt(id, 10);
            if (isNaN(batchIdNum) || batchIdNum <= 0) {
                return res.status(400).json({ success: false, message: 'Invalid import ID' });
            }

            res.json({
                success: true,
                message: 'Deletion started. All records for this import are being permanently removed.',
                data: { deletedOrdersCount: 'pending' },
            });

            setImmediate(async () => {
                try {
                    // Parameterized to prevent SQL injection
                    const deleted = await prisma.$executeRaw`DELETE FROM students WHERE import_batch_id = ${batchIdNum}`;
                    await prisma.importHistory.delete({ where: { id: BigInt(id) } });
                    console.log(`[delete-import] Done: ${deleted} rows permanently removed for batch ${batchIdNum}`);
                } catch (bgErr) {
                    console.error(`[delete-import] Failed for batch ${batchIdNum}:`, bgErr);
                }
            });

            return; // response already sent
        }


        if (['PENDING', 'FAILED', 'PROCESSING'].includes(importRecord.status)) {
            // For non-completed imports: just nullify batch refs and delete history record
            await prisma.$executeRawUnsafe(
                `UPDATE students SET import_batch_id = NULL WHERE import_batch_id = ${Number(id)}`
            );
            await prisma.importHistory.delete({ where: { id: BigInt(id) } });

            return res.json({
                success: true,
                message: 'Import record deleted successfully',
                data: { deletedOrdersCount: 0 },
            });
        }

        // deleteRecords=false on a COMPLETED import — not allowed
        return res.status(400).json({
            success: false,
            message: 'To delete a completed import, confirm deletion of all imported records.',
        });

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
