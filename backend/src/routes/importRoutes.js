import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import prisma from '../config/database.js';
import { mapHeaders, learnMappings, resultsToSuggestedMappings } from '../services/smartMapper.js';
import { notify, getAdminIds } from '../services/notificationService.js';
import { ensureOrderIdForCustomFields } from '../services/orderIdService.js';
import { readSettings } from './appSettingsRoutes.js';

const router = express.Router();

// ── In-memory live progress cache ────────────────────────────────────────────
// The DB only stores importedCount at the END of an import, so HTTP polling
// would always see 0% until completion. This cache stores live counts from
// the streaming processor so polling clients get real intermediate progress.
// Entries auto-delete 5 minutes after completion to avoid memory leaks.
const importProgressCache = new Map(); // importId (string) → { progress, imported, failed, skipped, updated, status }


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
    limits: { fileSize: 300 * 1024 * 1024 }, // 300MB limit
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
            // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Streaming CSV parse ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â O(1) memory regardless of file size ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
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
            // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ XLSX/XLS ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â fast path: read first 15 rows for preview ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
            const workbook = XLSX.readFile(req.file.path, {
                cellDates: true, cellNF: false, cellText: false,
                sheetStubs: true,
                sheetRows: 15,
            });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1, defval: '', blankrows: false, raw: false,
            });

            const headerRowIndex = jsonData.findIndex(row =>
                Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== '')
            );

            if (headerRowIndex !== -1) {
                headers = (jsonData[headerRowIndex] || []).map(h => String(h ?? '').trim());

                // Count rows using ExcelJS streaming (doesn't load all data into RAM)
                let rowCount = 0;
                const wbCount = new ExcelJS.stream.xlsx.WorkbookReader(req.file.path, { worksheets: 'emit' });
                for await (const ws of wbCount) {
                    for await (const row of ws) { rowCount++; }
                    break;
                }
                totalRows = Math.max(0, rowCount - 1 - headerRowIndex); // subtract header rows

                previewRows = jsonData.slice(headerRowIndex + 1).filter(row =>
                    Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== '')
                ).slice(0, 5);

                previewData = previewRows.map(row => {
                    const obj = {};
                    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
                    return obj;
                });
            } else {
                headers = [];
                totalRows = 0;
                previewRows = [];
                previewData = [];
            }
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

        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Smart auto-mapping ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
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

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Chunked Upload: receive one chunk ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
// Each chunk is a small multipart POST (ÃƒÂ¢Ã¢â‚¬Â°Ã‚Â¤10 MB) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â well under any Nginx limit.
// Fields: uploadId, chunkIndex, totalChunks, importType
// File field: chunk
const chunkUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = `./uploads/chunks/${req.body.uploadId}`;
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => cb(null, `chunk-${req.body.chunkIndex}`),
    }),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB per chunk
});

router.post('/upload-chunk', chunkUpload.single('chunk'), async (req, res, next) => {
    try {
        const { uploadId, chunkIndex, totalChunks } = req.body;
        if (!uploadId || chunkIndex === undefined || !totalChunks) {
            return res.status(400).json({ success: false, message: 'Missing chunk metadata' });
        }
        res.json({ success: true, received: Number(chunkIndex) + 1, total: Number(totalChunks) });
    } catch (err) {
        next(err);
    }
});

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Chunked Upload: assemble all chunks and run normal preview ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
// Body (JSON): { uploadId, fileName, importType }
router.post('/finalize-upload', async (req, res, next) => {
    const chunkDir = `./uploads/chunks/${req.body.uploadId}`;
    let finalPath = null;
    try {
        const { uploadId, fileName, importType = 'STUDENTS' } = req.body;
        if (!uploadId || !fileName) {
            return res.status(400).json({ success: false, message: 'Missing uploadId or fileName' });
        }

        // Count how many chunks arrived
        const chunkFiles = fs.readdirSync(chunkDir)
            .filter(f => f.startsWith('chunk-'))
            .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));

        if (chunkFiles.length === 0) {
            return res.status(400).json({ success: false, message: 'No chunks found' });
        }

        // Assemble into a single file
        const ext = path.extname(fileName);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        finalPath = `./uploads/import-${uniqueSuffix}${ext}`;
        const writeStream = fs.createWriteStream(finalPath);

        for (const chunkFile of chunkFiles) {
            const chunkPath = path.join(chunkDir, chunkFile);
            const data = fs.readFileSync(chunkPath);
            writeStream.write(data);
        }
        await new Promise((resolve, reject) => {
            writeStream.end();
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Clean up chunk directory
        fs.rmSync(chunkDir, { recursive: true, force: true });

        const isCSV = /\.csv$/i.test(fileName);
        let headers = [];
        let totalRows = 0;
        let previewData = [];
        let previewRows = [];

        if (isCSV) {
            const parseCSVLine = (line) => {
                const result = []; let cur = ''; let inQ = false;
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

            // Phase 1: fast preview ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â read only first 12 lines
            const rl = readline.createInterface({ input: fs.createReadStream(finalPath, { encoding: 'utf8' }), crlfDelay: Infinity });
            let headerParsed = false;
            let previewCount = 0;
            for await (const line of rl) {
                const cleanLine = headerParsed ? line : line.replace(/^\uFEFF/, '');
                if (!cleanLine.trim()) continue;
                if (!headerParsed) { headers = parseCSVLine(cleanLine); headerParsed = true; }
                else {
                    previewCount++;
                    const vals = parseCSVLine(line);
                    const obj = {};
                    headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : ''; });
                    previewData.push(obj);
                    if (previewCount <= 5) previewRows.push(vals);
                    if (previewCount >= 10) { rl.close(); break; }
                }
            }

            // Phase 2: fast byte-level line count (counts \n chars in raw bytes)
            await new Promise((resolve, reject) => {
                let count = 0;
                const NL = '\n'.charCodeAt(0);
                fs.createReadStream(finalPath)
                    .on('data', (buf) => { for (let i = 0; i < buf.length; i++) if (buf[i] === NL) count++; })
                    .on('end', () => { totalRows = Math.max(0, count - 1); resolve(null); }) // subtract header line
                    .on('error', reject);
            });
        } else {
            // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ XLSX/XLS ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â fast path: read first 15 rows for preview ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
            const workbook = XLSX.readFile(finalPath, {
                cellDates: true, cellNF: false, cellText: false,
                sheetStubs: true,
                sheetRows: 15,
            });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];

            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                header: 1, defval: '', blankrows: false, raw: false,
            });

            const headerRowIndex = jsonData.findIndex(row =>
                Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== '')
            );

            if (headerRowIndex !== -1) {
                headers = (jsonData[headerRowIndex] || []).map(h => String(h ?? '').trim());

                // Count rows using ExcelJS streaming ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â accurate, no full RAM load
                let rowCount = 0;
                const wbCount = new ExcelJS.stream.xlsx.WorkbookReader(finalPath, { worksheets: 'emit' });
                for await (const ws of wbCount) {
                    for await (const row of ws) { rowCount++; }
                    break;
                }
                totalRows = Math.max(0, rowCount - 1 - headerRowIndex);

                previewRows = jsonData.slice(headerRowIndex + 1).filter(row =>
                    Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== '')
                ).slice(0, 5);

                previewData = previewRows.map(row => {
                    const obj = {};
                    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
                    return obj;
                });
            }
        }

        const fileSize = fs.statSync(finalPath).size;
        const importHistory = await prisma.importHistory.create({
            data: { fileName, filePath: finalPath, fileSize: BigInt(fileSize), importType, totalRecords: totalRows, status: 'PENDING', importedById: req.user.id },
        });

        const mappingResults = mapHeaders(headers, previewRows, importType);
        const suggestedMappings = resultsToSuggestedMappings(mappingResults);

        res.json({
            success: true,
            message: 'File assembled successfully',
            data: {
                importId: importHistory.id.toString(),
                fileName,
                filePath: finalPath,
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
    } catch (err) {
        // Clean up on error
        if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        if (fs.existsSync(chunkDir)) fs.rmSync(chunkDir, { recursive: true, force: true });
        next(err);
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
        const { columnMapping, duplicateHandling = 'force' } = req.body;

        if (!columnMapping || Object.keys(columnMapping).length === 0) {
            return res.status(400).json({ success: false, message: 'Column mapping is required' });
        }

        // Get import record - use DB-stored filePath (never trust client-sent path for security)
        const importRecord = await prisma.importHistory.findUnique({ where: { id: BigInt(importId) } });
        if (!importRecord) {
            return res.status(404).json({ success: false, message: 'Import record not found' });
        }

        const filePath2 = importRecord.filePath;
        if (!filePath2 || !fs.existsSync(filePath2)) {
            await prisma.importHistory.update({
                where: { id: BigInt(importId) },
                data: { status: 'FAILED', errorLog: [{ error: 'File not found on server - please re-upload' }] },
            });
            return res.status(400).json({ success: false, message: 'File not found on server. Please re-upload.' });
        }

        // Update status to processing
        await prisma.importHistory.update({
            where: { id: BigInt(importId) },
            data: { status: 'PROCESSING', startedAt: new Date(), columnMapping },
        });

        // Respond immediately - processing runs in background
        res.json({ success: true, message: 'Processing started' });

        const io = req.app.get('io');
        const isCSVFile = /\.csv$/i.test(filePath2) || /\.csv$/i.test(importRecord.fileName || '');
        const BATCH_SIZE = 500;

        // ── processBatch: insert rows into DB with sub-batching & error logging ──
        async function processBatch(rows, hdrs, colMapping, dupHandling, record, impId, userId, accumulate) {
            const studentsToCreate = [];
            const leadsToCreate   = [];
            const batchErrors     = [];
            let   batchFailed     = 0;

            for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
                const row = rows[rowIdx];
                try {
                    const mappedData = {};
                    const subjectsArray = [];
                    const importedCustomFields = {};

                    // Store every cell value as a custom field (raw data preservation)
                    // _columnOrder is NOT stored per-row to save payload size
                    hdrs.forEach((header, index) => {
                        const value = row[index];
                        if (value !== undefined && value !== null && String(value).trim() !== '' && header && String(header).trim()) {
                            importedCustomFields[String(header).trim()] = String(value).trim().slice(0, 500);
                        }
                    });

                    // Apply column mapping to extract structured fields
                    Object.entries(colMapping).forEach(([colIndex, fieldName]) => {
                        const value = row[parseInt(colIndex)];
                        if (value !== undefined && value !== null && String(value).trim() !== '') {
                            if (fieldName && fieldName.startsWith('customField.')) {
                                importedCustomFields[fieldName.replace('customField.', '')] = String(value).trim().slice(0, 500);
                            } else if (fieldName === 'subjects') {
                                subjectsArray.push(String(value).trim());
                            } else {
                                mappedData[fieldName] = value;
                            }
                        }
                    });

                    if (subjectsArray.length > 0) mappedData.subjects = subjectsArray.filter(s => s);
                    // Limit customFields to 30 keys max to prevent oversized JSON
                    if (Object.keys(importedCustomFields).length > 0) {
                        const cfKeys = Object.keys(importedCustomFields).slice(0, 30);
                        const cf = {};
                        cfKeys.forEach(k => { cf[k] = importedCustomFields[k]; });
                        mappedData.customFields = cf;
                    }

                    // Skip entirely empty rows
                    if (Object.keys(mappedData).length === 0) { accumulate(0, 0, 1, 0, []); continue; }

                    // Fallback fullName
                    if (!mappedData.fullName) {
                        mappedData.fullName = mappedData.enrollmentNo ? `Student-${mappedData.enrollmentNo}`
                            : mappedData.controlNumber ? `Student-${mappedData.controlNumber}`
                            : mappedData.phone ? `Student-${mappedData.phone}`
                            : mappedData.email ? `Student-${mappedData.email.split('@')[0]}`
                            : `Student-Row${rowIdx + 2}`;
                    }

                    // Normalise string fields
                    ['enrollmentNo', 'controlNumber', 'phone', 'email', 'alternateEmail', 'alternatePhone',
                        'fullName', 'programme', 'course', 'regionalCenter', 'city', 'state', 'address', 'pincode', 'gender']
                        .forEach(k => {
                            if (mappedData[k] !== undefined) {
                                const v = String(mappedData[k]).trim();
                                mappedData[k] = (v && v !== 'undefined' && v !== 'null') ? v : null;
                            }
                        });

                    if (mappedData.batchYear) mappedData.batchYear = parseInt(mappedData.batchYear) || null;
                    if (mappedData.semester)  mappedData.semester  = parseInt(mappedData.semester)  || null;
                    if (mappedData.dateOfBirth)   { const d = new Date(mappedData.dateOfBirth);   mappedData.dateOfBirth   = isNaN(d.getTime()) ? null : d; }
                    if (mappedData.admissionDate) { const d = new Date(mappedData.admissionDate); mappedData.admissionDate = isNaN(d.getTime()) ? null : d; }

                    Object.keys(mappedData).forEach(k => {
                        if (k !== 'subjects' && k !== 'customFields' && (mappedData[k] === null || mappedData[k] === undefined || mappedData[k] === '')) delete mappedData[k];
                    });
                    if (mappedData.subjects && Array.isArray(mappedData.subjects)) {
                        mappedData.subjects = mappedData.subjects.filter(s => s && s.trim());
                        if (mappedData.subjects.length === 0) delete mappedData.subjects;
                    }

                    if (record.importType === 'STUDENTS') {
                        const skipUnique = dupHandling === 'force';
                        const studentData = {
                            fullName: mappedData.fullName || 'Unknown',
                            source: 'excel_import',
                            importBatchId: BigInt(impId),
                            createdById: userId,
                        };
                        if (!skipUnique && mappedData.enrollmentNo) studentData.enrollmentNo = mappedData.enrollmentNo;
                        if (!skipUnique && mappedData.email)        studentData.email        = mappedData.email;
                        if (!skipUnique && mappedData.phone)        studentData.phone        = mappedData.phone;
                        ['controlNumber', 'alternateEmail', 'alternatePhone', 'programme', 'course', 'regionalCenter',
                            'city', 'state', 'address', 'pincode', 'gender', 'batchYear', 'semester', 'dateOfBirth', 'admissionDate']
                            .forEach(k => { if (mappedData[k] != null) studentData[k] = mappedData[k]; });
                        if (mappedData.subjects && mappedData.subjects.length > 0) studentData.subjects = mappedData.subjects;
                        if (mappedData.customFields && Object.keys(mappedData.customFields).length > 0) studentData.customFields = mappedData.customFields;
                        studentsToCreate.push(studentData);
                    } else {
                        const srcMap = { website: 'WEBSITE', referral: 'REFERRAL', 'social media': 'SOCIAL_MEDIA', socialmedia: 'SOCIAL_MEDIA', 'walk in': 'WALK_IN', walkin: 'WALK_IN', 'phone inquiry': 'PHONE_INQUIRY', phoneinquiry: 'PHONE_INQUIRY', phone: 'PHONE_INQUIRY', manual: 'MANUAL', 'excel import': 'EXCEL_IMPORT', other: 'OTHER' };
                        const prMap  = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', urgent: 'URGENT' };
                        leadsToCreate.push({
                            fullName: mappedData.fullName || 'Unknown',
                            email: mappedData.email || null,
                            phone: mappedData.phone || null,
                            alternatePhone: mappedData.alternatePhone || null,
                            interestedCourse: mappedData.interestedCourse || null,
                            source: (mappedData.source && srcMap[mappedData.source.toString().toLowerCase().trim()]) || 'MANUAL',
                            priority: (mappedData.priority && prMap[mappedData.priority.toString().toLowerCase().trim()]) || 'MEDIUM',
                            sourceDetails: mappedData.sourceDetails || null,
                            createdById: userId,
                            importBatchId: BigInt(impId),
                        });
                    }
                } catch (err) {
                    batchErrors.push({ row: rowIdx + 2, error: err.message });
                    batchFailed++;
                }
            }

            // ── Insert in sub-batches of 200 to avoid DB payload limits ──────────
            let imp = 0, skp = 0;
            const SUB = 200;
            if (studentsToCreate.length > 0) {
                for (let i = 0; i < studentsToCreate.length; i += SUB) {
                    const sub = studentsToCreate.slice(i, i + SUB);
                    try {
                        const r = await prisma.student.createMany({ data: sub, skipDuplicates: dupHandling === 'skip' });
                        imp += r.count; skp += sub.length - r.count;
                    } catch (e) {
                        // Log one error per sub-batch, count all rows as failed
                        batchErrors.push({ rows: `${i}-${i + sub.length}`, error: e.message });
                        batchFailed += sub.length;
                    }
                }
            }
            if (leadsToCreate.length > 0) {
                for (let i = 0; i < leadsToCreate.length; i += SUB) {
                    const sub = leadsToCreate.slice(i, i + SUB);
                    try {
                        const r = await prisma.lead.createMany({ data: sub, skipDuplicates: dupHandling === 'skip' });
                        imp += r.count; skp += sub.length - r.count;
                    } catch (e) {
                        batchErrors.push({ rows: `${i}-${i + sub.length}`, error: e.message });
                        batchFailed += sub.length;
                    }
                }
            }
            accumulate(imp, 0, skp, batchFailed, batchErrors.slice(0, 3));
        }

        // ── Background processing: stream file & insert in batches ────────────
        setImmediate(async () => {
            let imported = 0, updated = 0, skipped = 0, failed = 0;
            const errors = [];

            const emitProgress = () => {
                const total = Number(importRecord.totalRecords) || 1;
                const done  = imported + failed + skipped;
                const pct   = Math.min(99, Math.round((done / total) * 100));
                const payload = { progress: pct, imported, failed, skipped, updated, status: 'PROCESSING' };
                io?.to(importId).emit('import-progress', payload);
                // Also write to in-memory cache so HTTP polling gets live intermediate progress
                // (the DB only stores importedCount at the very end of the import)
                importProgressCache.set(String(importId), payload);
            };

            // Seed cache immediately with PROCESSING status so the first HTTP poll
            // gets a valid response even before ExcelJS finishes loading shared strings
            importProgressCache.set(String(importId), { progress: 0, imported: 0, failed: 0, skipped: 0, updated: 0, status: 'PROCESSING' });

            // Emit immediately so frontend shows 0% right away — not a blank spinner.
            // ExcelJS takes 20-30s to cache shared strings for large XLSX before first row arrives.
            emitProgress();
            // Heartbeat: emit progress every 2s during file reading + row processing
            const heartbeat = setInterval(emitProgress, 2000);


            try {
                if (isCSVFile) {
                    // ── Streaming CSV ────────────────────────────────────────────
                    const parseCSVLine = (line) => {
                        const result = []; let cur = ''; let inQ = false;
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

                    const rl = readline.createInterface({ input: fs.createReadStream(filePath2, { encoding: 'utf8' }), crlfDelay: Infinity });
                    let csvHeaders = null;
                    let batch = [];

                    const flushCSV = async (b, hdrs) => {
                        await processBatch(b, hdrs, columnMapping, duplicateHandling, importRecord, importId, req.user.id,
                            (imp, upd, skp, fail, errs) => { imported += imp; updated += upd; skipped += skp; failed += fail; errors.push(...errs); });
                        emitProgress();
                    };

                    for await (const line of rl) {
                        const cleanLine = csvHeaders ? line : line.replace(/^\uFEFF/, '');
                        if (!cleanLine.trim()) continue;
                        if (!csvHeaders) {
                            csvHeaders = parseCSVLine(cleanLine);
                            // ── Persist original column order to importHistory ──────────
                            // MySQL JSON stores keys alphabetically, breaking display order.
                            // Saving _columnOrder here (once per import, not per row) lets
                            // the frontend restore the correct original column sequence.
                            const cleanHeaders = csvHeaders.map(h => String(h ?? '').trim()).filter(Boolean);
                            prisma.importHistory.update({
                                where: { id: BigInt(importId) },
                                data: { columnMapping: { ...(columnMapping || {}), _columnOrder: cleanHeaders } },
                            }).catch(e => console.error('[Import] Failed to save _columnOrder:', e.message));
                            continue;
                        }
                        batch.push(parseCSVLine(line));
                        if (batch.length >= BATCH_SIZE) { await flushCSV(batch, csvHeaders); batch = []; }
                    }
                    if (batch.length > 0) await flushCSV(batch, csvHeaders);

                } else {
                    // ── ExcelJS Streaming XLSX ───────────────────────────────────
                    const wbReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath2, {
                        worksheets: 'emit', sharedStrings: 'cache',
                        hyperlinks: 'ignore', styles: 'ignore', entries: 'emit',
                    });

                    let xlsHeaders = null;
                    let batch = [];

                    const flushXLS = async (b, hdrs) => {
                        await processBatch(b, hdrs, columnMapping, duplicateHandling, importRecord, importId, req.user.id,
                            (imp, upd, skp, fail, errs) => { imported += imp; updated += upd; skipped += skp; failed += fail; errors.push(...errs); });
                        emitProgress();
                    };

                    for await (const worksheet of wbReader) {
                        for await (const row of worksheet) {
                            const values = row.values ? row.values.slice(1) : [];
                            const rowArr = values.map(v => {
                                if (v === null || v === undefined) return '';
                                if (typeof v === 'object' && v.text) return String(v.text);
                                if (v instanceof Date) return v.toISOString().split('T')[0];
                                if (typeof v === 'object' && v.result !== undefined) return String(v.result);
                                return String(v);
                            });
                            if (xlsHeaders === null) {
                                if (rowArr.some(c => String(c ?? '').trim() !== '')) {
                                    xlsHeaders = rowArr.map(h => String(h ?? '').trim());
                                    // ── Persist original column order to importHistory ──────────
                                    // MySQL JSON stores keys alphabetically, breaking display order.
                                    // Saving _columnOrder here (once per import, not per row) lets
                                    // the frontend restore the correct original column sequence.
                                    const cleanHeaders = xlsHeaders.filter(Boolean);
                                    prisma.importHistory.update({
                                        where: { id: BigInt(importId) },
                                        data: { columnMapping: { ...(columnMapping || {}), _columnOrder: cleanHeaders } },
                                    }).catch(e => console.error('[Import] Failed to save _columnOrder:', e.message));
                                }
                                continue;
                            }
                            if (!rowArr.some(c => String(c ?? '').trim() !== '')) continue;
                            batch.push(rowArr);
                            if (batch.length >= BATCH_SIZE) { await flushXLS(batch, xlsHeaders); batch = []; }
                        }
                        break; // first sheet only
                    }
                    if (batch.length > 0 && xlsHeaders) await flushXLS(batch, xlsHeaders);
                }

                // ── Finalization ─────────────────────────────────────────────────
                clearInterval(heartbeat);

                // Mark cache as COMPLETED with final counts so any in-flight poll gets 100%
                importProgressCache.set(String(importId), {
                    progress: 100, imported, updated, skipped, failed, status: 'COMPLETED',
                });
                // Auto-cleanup after 5 min to avoid unbounded memory growth
                setTimeout(() => importProgressCache.delete(String(importId)), 5 * 60 * 1000);

                // Signal completion to frontend FIRST (before slow DB update)
                io?.to(importId).emit('import-complete', { importId, imported, updated, skipped, failed });

                // Update DB status
                await prisma.importHistory.update({
                    where: { id: BigInt(importId) },
                    data: {
                        status: 'COMPLETED', completedAt: new Date(),
                        importedCount: imported, updatedCount: updated,
                        skippedCount: skipped, failedCount: failed,
                        errorLog: errors.length > 0 ? errors.slice(0, 20) : null,
                    },
                });

                try { fs.unlinkSync(filePath2); } catch (e) { /* already gone */ }

                // Fire-and-forget notifications (don't block completion)
                getAdminIds().then(adminIds => {
                    const notifyIds = [...new Set([importRecord.importedById, ...adminIds].filter(Boolean))];
                    const typeName  = importRecord.importType === 'STUDENTS' ? 'Orders' : 'Leads';
                    return notify(io, {
                        userIds: notifyIds, type: 'IMPORT_DONE',
                        title: `${typeName} Import Completed`,
                        message: `${imported} imported, ${skipped} skipped, ${failed} failed.`,
                        link: importRecord.importType === 'STUDENTS' ? '/orders' : '/leads',
                    });
                }).catch(e => console.error('[Import notify]', e.message));

            } catch (bgError) {
                clearInterval(heartbeat);
                console.error(`[Import ${importId}] error:`, bgError);
                try {
                    await prisma.importHistory.update({ where: { id: BigInt(importId) }, data: { status: 'FAILED', errorLog: [{ error: bgError.message }] } });
                    io?.to(importId).emit('import-error', { importId, error: bgError.message });
                } catch (_) {}
            }
        });

    } catch (error) {
        next(error);
    }
});



// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Save confirmed column mappings to learning memory ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
// ── Live progress endpoint (HTTP polling fallback) ────────────────────────────
// Reads from in-memory cache written by the streaming processor every 2s.
// This gives real intermediate progress without requiring WebSocket connectivity.
router.get('/live-progress/:importId', async (req, res, next) => {
    try {
        const { importId } = req.params;
        const cached = importProgressCache.get(String(importId));
        if (cached) {
            return res.json({ success: true, data: cached });
        }
        // Cache miss: fall back to DB status (handles page refreshes after completion)
        const record = await prisma.importHistory.findUnique({
            where: { id: BigInt(importId) },
            select: { status: true, totalRecords: true, importedCount: true, failedCount: true, skippedCount: true, updatedCount: true },
        });
        if (!record) return res.status(404).json({ success: false, message: 'Import not found' });
        const total = Number(record.totalRecords) || 1;
        const done  = (record.importedCount || 0) + (record.failedCount || 0) + (record.skippedCount || 0);
        const progress = record.status === 'COMPLETED' ? 100 : Math.min(99, Math.round((done / total) * 100));
        res.json({ success: true, data: {
            progress,
            imported: record.importedCount || 0,
            failed: record.failedCount || 0,
            skipped: record.skippedCount || 0,
            updated: record.updatedCount || 0,
            status: record.status,
        }});
    } catch (error) {
        next(error);
    }
});

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
            // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Fire-and-forget background deletion ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
            // Response is sent immediately ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â deletion runs fully in background.
            // Single DELETE with no LIMIT ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â removes every row for this batch.

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

        // deleteRecords=false on a COMPLETED import ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â not allowed
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
