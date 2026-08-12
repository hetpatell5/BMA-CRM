import express from 'express';
import prisma from '../config/database.js';
import { Prisma } from '@prisma/client';
import { notify, getAdminIds } from '../services/notificationService.js';
import { ensureOrderIdForCustomFields } from '../services/orderIdService.js';
import { readSettings } from './appSettingsRoutes.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';

// Temp directory for storing segregation plan files (expire after 24h)
const SEG_PLANS_DIR = path.join(os.tmpdir(), 'bma-seg-plans');
try { fs.mkdirSync(SEG_PLANS_DIR, { recursive: true }); } catch (_) { }

// Internal customField keys to exclude from CSV exports
const CF_INTERNAL_KEYS = new Set([
    'requirementassignments', 'telecallerowners', 'orderidprefix',
    'orderidrequirement', 'orderidgenerated', 'orderidsignature', 'columnorder'
]);
function cfIsInternal(key) {
    if (!key) return true;
    if (key.startsWith('_')) return true;
    return CF_INTERNAL_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
}
function toCSVCell(val) {
    if (val === null || val === undefined) return '';
    return '"' + String(val).replace(/"/g, '""') + '"';
}

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
// GET /students/meta/import-field-values?field=Programme&batchIds=1,2,3
router.get('/meta/import-field-values', async (req, res, next) => {
    try {
        const { field, batchId, batchIds } = req.query;
        if (!field) return res.json({ success: true, data: [] });

        const escapedField = String(field).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        // Collect all batch IDs from both batchId (single) and batchIds (comma-sep)
        const rawIds = [
            ...(batchId ? [String(batchId)] : []),
            ...(batchIds ? String(batchIds).split(',').map(s => s.trim()).filter(Boolean) : []),
        ];
        const uniqueIds = [...new Set(rawIds)];

        let rows;
        if (uniqueIds.length > 0) {
            // Build IN clause dynamically with BigInt placeholders
            const placeholders = uniqueIds.map(() => '?').join(', ');
            rows = await prisma.$queryRawUnsafe(
                `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${escapedField}"')) AS val
                 FROM students
                 WHERE source = 'excel_import'
                   AND import_batch_id IN (${placeholders})
                   AND JSON_EXTRACT(custom_fields, '$."${escapedField}"') IS NOT NULL
                   AND JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${escapedField}"')) NOT IN ('null','')
                 ORDER BY val ASC`,
                ...uniqueIds.map(id => BigInt(id))
            );
        } else {
            rows = await prisma.$queryRawUnsafe(
                `SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${escapedField}"')) AS val
                 FROM students
                 WHERE source = 'excel_import'
                   AND JSON_EXTRACT(custom_fields, '$."${escapedField}"') IS NOT NULL
                   AND JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${escapedField}"')) NOT IN ('null','')
                 ORDER BY val ASC`
            );
        }

        const values = rows.map(r => r.val).filter(Boolean);
        res.json({ success: true, data: values });
    } catch (error) {
        next(error);
    }
});

// Get filter options (for dropdowns) - MUST be before /:id route
// ?scope=orders — returns full filter options for Orders page
// (default / import scope) — returns only importBatches; column filters come from student data itself
// ── In-memory cache for filter options (avoids heavy DB queries on every page load) ──
const _filtersCache = new Map(); // key → { data, expiresAt }
const FILTERS_TTL_MS = 5 * 60_000; // 5 minutes — filter data rarely changes mid-session

router.get('/meta/filters', async (req, res, next) => {
    try {
        const isOrdersScope = req.query.scope === 'orders';
        const cacheKey = isOrdersScope ? 'orders' : 'import';

        // Serve from cache if fresh
        const cached = _filtersCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            return res.json({ success: true, data: cached.data });
        }

        let responseData;

        if (!isOrdersScope) {
            // ── Import / Data page scope ─────────────────────────────────────
            // Only importBatches is needed here — column filter options come
            // from the student records themselves (collectCustomFieldColumns).
            // Running the other 4 queries here wastes 3-5 seconds for nothing.
            const importBatches = await prisma.importHistory.findMany({
                where: { status: 'COMPLETED', importType: 'STUDENTS' },
                select: { id: true, fileName: true, importedCount: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            });

            responseData = {
                programmes: [],
                regionalCenters: [],
                subjects: [],
                customFieldKeys: [],
                statuses: ['NEW_LEAD', 'SYNOPSIS_SENT', 'GUIDE_ASSIGNED', 'REPORT_IN_PROGRESS', 'SHIPPED', 'ALL_DONE'],
                importBatches: importBatches.map(b => ({
                    id: b.id.toString(),
                    fileName: b.fileName,
                    importedCount: b.importedCount,
                    createdAt: b.createdAt,
                })),
            };
        } else {
            // ── Orders page scope — run full queries ─────────────────────────
            const scopeWhere = { NOT: { source: 'excel_import' } };

            const [programmes, regionalCenters, studentsWithSubjects, studentsForCF] = await Promise.all([
                prisma.student.findMany({
                    select: { programme: true },
                    distinct: ['programme'],
                    where: { programme: { not: null }, ...scopeWhere },
                }),
                prisma.student.findMany({
                    select: { regionalCenter: true },
                    distinct: ['regionalCenter'],
                    where: { regionalCenter: { not: null }, ...scopeWhere },
                }),
                prisma.student.findMany({
                    select: { subjects: true },
                    where: { subjects: { not: null }, ...scopeWhere },
                }),
                prisma.student.findMany({
                    select: { customFields: true },
                    where: { customFields: { not: null }, ...scopeWhere },
                    take: 200,
                }),
            ]);

            const subjectsSet = new Set();
            studentsWithSubjects.forEach(s => {
                if (s.subjects && Array.isArray(s.subjects)) {
                    s.subjects.forEach(sub => { if (sub && sub.trim()) subjectsSet.add(sub.trim()); });
                }
            });

            const customFieldKeysSet = new Set();
            studentsForCF.forEach(s => {
                if (s.customFields && typeof s.customFields === 'object') {
                    Object.keys(s.customFields).forEach(k => {
                        if (k && k.trim() && !k.startsWith('_')) customFieldKeysSet.add(k.trim());
                    });
                }
            });

            responseData = {
                programmes: programmes.map(p => p.programme).filter(Boolean).sort((a, b) => a.localeCompare(b)),
                regionalCenters: regionalCenters.map(r => r.regionalCenter).filter(Boolean).sort((a, b) => a.localeCompare(b)),
                subjects: Array.from(subjectsSet).sort((a, b) => a.localeCompare(b)),
                customFieldKeys: Array.from(customFieldKeysSet).sort((a, b) => a.localeCompare(b)),
                statuses: ['NEW_LEAD', 'SYNOPSIS_SENT', 'GUIDE_ASSIGNED', 'REPORT_IN_PROGRESS', 'SHIPPED', 'ALL_DONE'],
                importBatches: [],
            };
        }

        // Store in cache
        _filtersCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + FILTERS_TTL_MS });

        res.json({ success: true, data: responseData });
    } catch (error) {
        next(error);
    }
});


// Export records to CSV — streaming, cursor-based pagination (no OFFSET), re-importable
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

        if (importBatchId) {
            where.importBatchId = BigInt(importBatchId);
        } else if (req.query.importBatchIds) {
            const bids = String(req.query.importBatchIds).split(',').map(s => s.trim()).filter(Boolean);
            if (bids.length > 0) where.importBatchId = { in: bids.map(id => BigInt(id)) };
        }

        if (search) {
            where.OR = [
                { fullName: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
                { enrollmentNo: { contains: search } },
                { programme: { contains: search } },
                { course: { contains: search } },
                { regionalCenter: { contains: search } },
            ];
        }

        if (status) where.status = status;
        if (programme) where.programme = { equals: programme };
        if (regionalCenter) where.regionalCenter = { equals: regionalCenter };
        if (subject) where.subjects = { array_contains: [subject] };

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

        // ── Grab first record to determine column order + starting cursor ─────────
        const firstRow = await prisma.student.findFirst({
            where,
            orderBy: { id: 'desc' },
            select: { id: true, customFields: true },
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

        // Helper: escape a single CSV cell value (RFC 4180 compliant)
        const csvCell = (val) => {
            if (val === null || val === undefined) return '';
            const s = Array.isArray(val) ? val.join(', ') : String(val);
            if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };

        // ── Plain streaming CSV response (no gzip — nginx proxies strip Content-Encoding) ─
        // Accept a `filename` query param so the frontend can control the download name
        const rawFilename = req.query.filename ? String(req.query.filename).replace(/[^a-zA-Z0-9_\-\.]/g, '_') : 'export';
        const filename = rawFilename.endsWith('.csv') ? rawFilename : `${rawFilename}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Write header row (no BOM — BOM breaks SheetJS re-import)
        res.write(visibleCols.map(csvCell).join(',') + '\r\n');

        // ── Cursor-based pagination — O(1) per chunk, always as fast as the first ──
        // Walk backwards through IDs using primary key index. No OFFSET scanning.
        // IMPORTANT: if customField filter set where.id = { in: [...ids] }, we must
        // preserve that constraint while also applying the cursor. Use AND to combine.
        const CHUNK = 2000;
        let lastId = firstRow.id;
        let isFirst = true;
        const idInFilter = where.id; // may be undefined or { in: BigInt[] }
        const baseWhere = { ...where };
        delete baseWhere.id; // remove id — we'll add it back per-chunk via AND

        while (true) {
            // Build cursor constraint
            const cursorId = isFirst ? { lte: lastId } : { lt: lastId };

            // Combine cursor with any existing id.in filter
            const chunkWhere = idInFilter
                ? { ...baseWhere, AND: [{ id: idInFilter }, { id: cursorId }] }
                : { ...baseWhere, id: cursorId };

            const rows = await prisma.student.findMany({
                where: chunkWhere,
                orderBy: { id: 'desc' },
                select: { id: true, customFields: true },
                take: CHUNK,
            });

            if (rows.length === 0) break;

            let buf = '';
            for (const row of rows) {
                const cf = row.customFields || {};
                buf += visibleCols.map(col => csvCell(cf[col])).join(',') + '\r\n';
            }
            res.write(buf);

            lastId = rows[rows.length - 1].id;
            isFirst = false;
            if (rows.length < CHUNK) break;

            // Yield event loop between chunks so other requests stay responsive
            await new Promise(resolve => setImmediate(resolve));
        }

        res.end();
    } catch (error) {
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
        const isTelecaller = req.user.role === 'STAFF' && req.user.staffRole === 'TELECALLER';
        const isAdminManager = req.user.role === 'ADMIN' || req.user.role === 'MANAGER';

        if (!isAdminManager && !isTelecaller) {
            return res.status(403).json({
                success: false,
                message: 'Only admins, managers, and telecallers can delete records',
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

        let result;
        if (isTelecaller) {
            // Telecallers can only delete their own assigned records
            result = await prisma.student.deleteMany({
                where: {
                    id: { in: bigIntIds },
                    assignedById: req.user.id,   // only their own records
                    source: 'excel_import',
                },
            });
        } else {
            result = await prisma.student.deleteMany({
                where: { id: { in: bigIntIds } },
            });
        }

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
        if (importBatchId) {
            where.importBatchId = BigInt(importBatchId);
        } else if (req.query.importBatchIds) {
            // Multi-select batch filter: ?importBatchIds=1,2,3
            const bids = String(req.query.importBatchIds).split(',').map(s => s.trim()).filter(Boolean);
            if (bids.length > 0) where.importBatchId = { in: bids.map(id => BigInt(id)) };
        }
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
        // Telecallers on the Data page: only see excel_import records assigned to them.
        // We use the assigned_by_id column directly — simple integer equality, no JSON needed.
        if (isTelecaller && where.source === 'excel_import') {
            where.assignedById = req.user.id;
        }

        // Apply custom field filters (Programme, Regional Center, etc.)
        // Works for all roles — ANDed with any existing where conditions.
        if (cfFilterEntries.length > 0) {
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
            const cfMatchingIds = cfRows.map(r => BigInt(r.id));

            // Intersect with any existing id filter
            if (where.id && where.id.in) {
                const existing = new Set(where.id.in.map(id => BigInt(id).toString()));
                where.id.in = cfMatchingIds.filter(id => existing.has(id.toString()));
            } else {
                where.id = { in: cfMatchingIds };
            }
        }

        // ── Run count + findMany in parallel (saves 1-2 seconds) ─────────────
        // Also fetch batch column order if filtering by a single importBatch
        const batchId = importBatchId || (req.query.importBatchIds?.split(',').length === 1 ? req.query.importBatchIds : null);
        const [total, students, batchRecord] = await Promise.all([
            prisma.student.count({ where }),
            prisma.student.findMany({
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
            }),
            // Fetch batch column order when a single batch is selected
            batchId ? prisma.importHistory.findUnique({
                where: { id: BigInt(batchId) },
                select: { columnMapping: true },
            }) : Promise.resolve(null),
        ]);

        // Extract column order from batch record (stored as columnMapping._columnOrder)
        const columnOrder = (() => {
            if (!batchRecord?.columnMapping) return null;
            const cm = batchRecord.columnMapping;
            if (Array.isArray(cm._columnOrder) && cm._columnOrder.length > 0) return cm._columnOrder;
            return null;
        })();

        // ── Skip backfill for excel_import (telecaller data) ─────────────────
        // excel_import records don't need order IDs generated; skipping avoids
        // up to 50 sequential DB UPDATEs per page load (saves 1-3 seconds).
        const isExcelPage = where.source === 'excel_import';
        if (!isExcelPage) {
            await applyOrderIdBackfill(students, readSettings());
        }

        // Get student IDs (as numbers for raw SQL)
        const studentIds = students.map(s => s.id);

        // ── Fetch guide info in one JOIN query ───────────────────────────────
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
                // Column order for import-preview display — overrides MySQL's alphabetical JSON key sorting
                columnOrder: columnOrder || null,
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
        // All authenticated users can mark an imported row as an order
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

// ── Segregate: compute split and save a plan file — NO DB writes ──────────────
// POST /api/students/segregate
router.post('/segregate', async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'MANAGER';
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Only admins and managers can segregate data' });

        const { assigneeIds, importBatchIds: batchIdsRaw, programmes: programmesFilter, customField: cfRaw, dryRun, studentIds: studentIdsRaw } = req.body;
        if (!assigneeIds || !Array.isArray(assigneeIds) || assigneeIds.length === 0) {
            return res.status(400).json({ success: false, message: 'assigneeIds array is required' });
        }

        // Validate assignees
        const assignees = await prisma.user.findMany({
            where: { id: { in: assigneeIds.map(Number) }, status: 'ACTIVE' },
            select: { id: true, fullName: true },
        });
        if (assignees.length === 0) return res.status(400).json({ success: false, message: 'No valid assignee IDs provided' });

        // ── Mode 1: explicit student IDs (checkbox selection from UI) ─────────
        // When the user has ticked specific rows, segregate only those records.
        // We skip all batch/filter logic and query directly by ID.
        const useExplicitIds = Array.isArray(studentIdsRaw) && studentIdsRaw.length > 0;

        // Build WHERE clause for the raw SQL query
        const whereParts = [`source = 'excel_import'`];
        const queryParams = [];

        if (useExplicitIds) {
            // Filter to exactly the selected student IDs
            whereParts.push(`id IN (${studentIdsRaw.map(() => '?').join(', ')})`);
            studentIdsRaw.forEach(id => queryParams.push(BigInt(id)));
        } else {
            // ── Mode 2: batch + custom-field filters (filter-panel selection) ──
            if (batchIdsRaw && Array.isArray(batchIdsRaw) && batchIdsRaw.length > 0) {
                whereParts.push(`import_batch_id IN (${batchIdsRaw.map(() => '?').join(', ')})`);
                batchIdsRaw.forEach(id => queryParams.push(BigInt(id)));
            }
            const cfEntries = cfRaw && typeof cfRaw === 'object' ? Object.entries(cfRaw).filter(([k, v]) => k && v) : [];
            for (const [k, v] of cfEntries) {
                const ek = k.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                const vals = String(v).split(',').map(s => s.trim()).filter(Boolean);
                if (!vals.length) continue;
                whereParts.push(`JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${ek}"')) IN (${vals.map(() => '?').join(', ')})`);
                vals.forEach(val => queryParams.push(val));
            }
        }
        const whereSQL = whereParts.join(' AND ');

        // Prog column: use first CF filter key, else scan common names
        const cfEntries2 = !useExplicitIds && cfRaw && typeof cfRaw === 'object' ? Object.entries(cfRaw).filter(([k, v]) => k && v) : [];
        const progCfKey = cfEntries2.length > 0 ? cfEntries2[0][0] : null;
        let selectExpr;
        if (progCfKey) {
            const ek = progCfKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            selectExpr = `id, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."${ek}"')), programme, 'Unknown') AS prog`;
        } else {
            selectExpr = `id, COALESCE(programme, JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."Programme"')), JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."PROGRAMME"')), JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$."programme"')), 'Unknown') AS prog`;
        }

        // Fetch (id, prog) only — lightweight, no full JSON blob per row
        const rows = await prisma.$queryRawUnsafe(
            `SELECT ${selectExpr} FROM students WHERE ${whereSQL} ORDER BY id ASC`,
            ...queryParams
        );

        // ── Programme-aware round-robin with rotating offset ─────────────────
        // Groups records by programme, distributes each group round-robin.
        // A globalOffset rotates the starting assignee for each new programme
        // group so the "extra" (remainder) records from each group land on
        // different assignees — not always assignee 0. This keeps both:
        //   • Degree-wise distribution: each assignee gets ⌊K/N⌋ or ⌈K/N⌉ of each degree
        //   • Overall totals:           each assignee gets ⌊T/N⌋ or ⌈T/N⌉ overall
        const perAssignee = {}; // assigneeId → {name, ids[]}
        for (const a of assignees) perAssignee[a.id] = { name: a.fullName, ids: [] };

        const n = assignees.length;

        // 1. Group row IDs by programme (preserving ORDER BY id ASC order)
        const progGroups = new Map(); // prog → id[]
        for (const row of rows) {
            const prog = row.prog || 'Unknown';
            if (!progGroups.has(prog)) progGroups.set(prog, []);
            progGroups.get(prog).push(row.id);
        }

        // 2. Distribute each group round-robin starting from a rotating offset.
        //    After each group, advance the offset by (groupSize % n) so the
        //    next group's starting assignee shifts, spreading remainder records
        //    evenly across all members over many programme groups.
        let globalOffset = 0;
        for (const [, ids] of progGroups) {
            for (let i = 0; i < ids.length; i++) {
                const assigneeIndex = (globalOffset + i) % n;
                perAssignee[assignees[assigneeIndex].id].ids.push(ids[i]);
            }
            // Advance offset so the next group starts where this one left off
            globalOffset = (globalOffset + ids.length) % n;
        }

        if (dryRun) {
            // Return a compact per-member summary for the preview panel
            const summary = assignees.map(a => ({
                assigneeId: a.id,
                assigneeName: a.fullName,
                count: perAssignee[a.id].ids.length,
            }));
            return res.json({ success: true, data: { summary, totalStudents: rows.length } });
        }

        // Save plan to a temp JSON file so the download endpoint can serve it
        const planId = randomUUID();
        const planPayload = {
            expires: Date.now() + 6 * 60 * 60 * 1000, // 6 hours
            whereSQL, // stored for potential re-query on download
            assignments: {}
        };
        for (const [aid, { name, ids }] of Object.entries(perAssignee)) {
            planPayload.assignments[aid] = { name, ids: ids.map(id => id.toString()) };
        }
        fs.writeFileSync(path.join(SEG_PLANS_DIR, `${planId}.json`), JSON.stringify(planPayload));

        // Return plan summary + download URLs (NO DB writes)
        const members = assignees.map(a => ({
            assigneeId: a.id,
            assigneeName: a.fullName,
            count: perAssignee[a.id].ids.length,
            downloadUrl: `/api/students/segregate/xlsx/${planId}/${a.id}`,
        }));
        res.json({
            success: true,
            data: { planId, totalStudents: rows.length, members }
        });
    } catch (error) { next(error); }
});

// ── Stream XLSX for a specific member from a saved plan ──────────────────────
// GET /api/students/segregate/xlsx/:planId/:assigneeId
router.get('/segregate/xlsx/:planId/:assigneeId', async (req, res, next) => {
    try {
        const planFile = path.join(SEG_PLANS_DIR, `${req.params.planId}.json`);
        if (!fs.existsSync(planFile)) {
            return res.status(404).json({ success: false, message: 'Plan not found or has expired (plans last 6 hours).' });
        }
        const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
        if (plan.expires < Date.now()) {
            fs.unlinkSync(planFile);
            return res.status(410).json({ success: false, message: 'Plan expired. Please re-run segregation.' });
        }
        const assigneeData = plan.assignments[req.params.assigneeId];
        if (!assigneeData) return res.status(404).json({ success: false, message: 'Assignee not found in plan.' });

        const { name, ids } = assigneeData;
        const safeName = name.replace(/[^a-z0-9]/gi, '_');

        // Build XLSX in memory using ExcelJS (stream-friendly)
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Data');

        const BATCH = 2000;
        let headersSet = false;

        for (let i = 0; i < ids.length; i += BATCH) {
            const batchIds = ids.slice(i, i + BATCH).map(id => BigInt(id));
            const records = await prisma.student.findMany({
                where: { id: { in: batchIds } },
                select: { id: true, customFields: true },
                orderBy: { id: 'asc' },
            });

            if (!headersSet) {
                let headers = null;
                for (const r of records) {
                    const cf = r.customFields || {};
                    if (Array.isArray(cf._columnOrder) && cf._columnOrder.length > 0) {
                        headers = cf._columnOrder.filter(h => h && !cfIsInternal(h));
                        break;
                    }
                }
                if (!headers) {
                    const keySet = new Set();
                    for (const r of records) {
                        Object.keys(r.customFields || {}).forEach(k => { if (!cfIsInternal(k)) keySet.add(k); });
                    }
                    headers = [...keySet];
                }
                sheet.columns = headers.map(h => ({ header: h, key: h, width: 20 }));
                headersSet = true;
            }

            for (const r of records) {
                const cf = r.customFields || {};
                const row = {};
                sheet.columns.forEach(col => { row[col.key] = cf[col.key] ?? ''; });
                sheet.addRow(row);
            }
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}_segregated.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) { next(error); }
});


// ── Assign segregated records directly to member dashboards ──────────────────
// POST /api/students/segregate/assign
// Same round-robin logic as /segregate, but instead of generating XLSXs it
// writes _telecallerOwners into each student's customFields so the assigned
// telecaller sees those records on their Data page.
router.post('/segregate/assign', async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'MANAGER';
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Only admins and managers can segregate data' });

        const { assigneeIds, importBatchIds: batchIdsRaw, customField: cfRaw, studentIds: studentIdsRaw } = req.body;
        if (!assigneeIds || !Array.isArray(assigneeIds) || assigneeIds.length === 0) {
            return res.status(400).json({ success: false, message: 'assigneeIds array is required' });
        }

        // Validate assignees
        const assignees = await prisma.user.findMany({
            where: { id: { in: assigneeIds.map(Number) }, status: 'ACTIVE' },
            select: { id: true, fullName: true, role: true, staffRole: true },
        });
        if (assignees.length === 0) return res.status(400).json({ success: false, message: 'No valid assignee IDs provided' });

        // Build WHERE clause — same dual-mode logic as /segregate
        const useExplicitIds = Array.isArray(studentIdsRaw) && studentIdsRaw.length > 0;
        const whereParts = [`source = 'excel_import'`];
        const queryParams = [];

        if (useExplicitIds) {
            whereParts.push(`id IN (${studentIdsRaw.map(() => '?').join(', ')})`);
            studentIdsRaw.forEach(id => queryParams.push(BigInt(id)));
        } else {
            if (batchIdsRaw && Array.isArray(batchIdsRaw) && batchIdsRaw.length > 0) {
                whereParts.push(`import_batch_id IN (${batchIdsRaw.map(() => '?').join(', ')})`);
                batchIdsRaw.forEach(id => queryParams.push(BigInt(id)));
            }
            const cfEntries = cfRaw && typeof cfRaw === 'object' ? Object.entries(cfRaw).filter(([k, v]) => k && v) : [];
            for (const [k, v] of cfEntries) {
                const ek = k.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                const vals = String(v).split(',').map(s => s.trim()).filter(Boolean);
                if (!vals.length) continue;
                whereParts.push(`JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$.\"${ek}\"')) IN (${vals.map(() => '?').join(', ')})`);
                vals.forEach(val => queryParams.push(val));
            }
        }
        const whereSQL = whereParts.join(' AND ');

        // Fetch (id, prog) — lightweight
        const cfEntries2 = !useExplicitIds && cfRaw && typeof cfRaw === 'object' ? Object.entries(cfRaw).filter(([k, v]) => k && v) : [];
        const progCfKey = cfEntries2.length > 0 ? cfEntries2[0][0] : null;
        let selectExpr;
        if (progCfKey) {
            const ek = progCfKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            selectExpr = `id, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$.\"${ek}\"')), programme, 'Unknown') AS prog`;
        } else {
            selectExpr = `id, COALESCE(programme, JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$.\"Programme\"')), JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$.\"PROGRAMME\"')), JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$.\"programme\"')), 'Unknown') AS prog`;
        }

        const rows = await prisma.$queryRawUnsafe(
            `SELECT ${selectExpr} FROM students WHERE ${whereSQL} ORDER BY id ASC`,
            ...queryParams
        );

        if (rows.length === 0) {
            return res.json({ success: true, data: { assigned: 0, members: [] } });
        }

        // ── Programme-aware round-robin with rotating offset ─────────────────
        const n = assignees.length;
        const perAssignee = {};
        for (const a of assignees) perAssignee[a.id] = { ...a, ids: [] };

        const progGroups = new Map();
        for (const row of rows) {
            const prog = row.prog || 'Unknown';
            if (!progGroups.has(prog)) progGroups.set(prog, []);
            progGroups.get(prog).push(row.id);
        }

        let globalOffset = 0;
        for (const [, ids] of progGroups) {
            for (let i = 0; i < ids.length; i++) {
                const assigneeIndex = (globalOffset + i) % n;
                perAssignee[assignees[assigneeIndex].id].ids.push(ids[i]);
            }
            globalOffset = (globalOffset + ids.length) % n;
        }

        // ── Write assigned_by_id to each student record ──────────────────────────
        // Simple integer column update — no JSON, no CAST, works on all MySQL versions.
        // assigned_by_id tracks which telecaller owns this record for their Data page.
        const BATCH = 500;
        let totalAssigned = 0;

        for (const assignee of assignees) {
            const { id, ids } = perAssignee[assignee.id];
            if (ids.length === 0) continue;

            for (let i = 0; i < ids.length; i += BATCH) {
                const batchIds = ids.slice(i, i + BATCH).map(x => BigInt(x));
                const placeholders = batchIds.map(() => '?').join(', ');

                await prisma.$executeRawUnsafe(
                    `UPDATE students SET assigned_by_id = ? WHERE id IN (${placeholders})`,
                    Number(id),
                    ...batchIds
                );

                totalAssigned += batchIds.length;
            }
        }

        const summary = assignees.map(a => ({
            assigneeId: a.id,
            assigneeName: a.fullName,
            count: perAssignee[a.id].ids.length,
        }));

        res.json({
            success: true,
            data: { assigned: totalAssigned, members: summary }
        });
    } catch (error) { next(error); }
});

export default router;
