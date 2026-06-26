/**
 * ignouRoutes.js
 * REST endpoints for IGNOU Assignment Status Checker.
 */

import express from 'express';
import ExcelJS from 'exceljs';
import prisma from '../config/database.js';
import { enqueueBatch, enqueueStudent, enqueueStudentsBulk, ignouQueue } from '../services/ignouQueue.js';

const router = express.Router();

// ── POST /api/ignou/check/batch/:batchId ─────────────────────────────────────
// Enqueue all eligible students in an import batch
router.post('/check/batch/:batchId', async (req, res, next) => {
    try {
        const { batchId } = req.params;
        const result = await enqueueBatch(batchId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// ── POST /api/ignou/check/student/:studentId ─────────────────────────────────
router.post('/check/student/:studentId', async (req, res, next) => {
    try {
        const result = await enqueueStudent(req.params.studentId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// ── POST /api/ignou/check/students ───────────────────────────────────────────
// Enqueue a specific array of student IDs (checkbox-selected rows)
// Uses enqueueStudentsBulk which properly resets progress counters
router.post('/check/students', async (req, res, next) => {
    try {
        const { studentIds } = req.body;
        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ success: false, message: 'studentIds array required' });
        }
        const result = await enqueueStudentsBulk(studentIds);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// ── POST /api/ignou/results/by-students ──────────────────────────────────────
// Fetch check results for a specific list of student IDs (selected-rows mode)
router.post('/results/by-students', async (req, res, next) => {
    try {
        const { studentIds } = req.body;
        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ success: false, message: 'studentIds required' });
        }
        const records = await prisma.ignouCheck.findMany({
            where: { studentId: { in: studentIds.map(id => BigInt(id)) } },
            select: {
                id: true, studentId: true, enrollmentNo: true, programme: true, studentName: true,
                checkStatus: true, totalItems: true, submittedCount: true, pendingCount: true,
                pendingCourses: true, assignmentRows: true, errorMessage: true, checkedAt: true, updatedAt: true,
            },
        });
        res.json({ success: true, data: { records } });
    } catch (err) { next(err); }
});

// ── GET /api/ignou/queue/status ──────────────────────────────────────────────
// Real-time queue counters
router.get('/queue/status', async (req, res, next) => {
    try {
        const [waiting, active, completed, failed] = await Promise.all([
            ignouQueue.getWaitingCount(),
            ignouQueue.getActiveCount(),
            ignouQueue.getCompletedCount(),
            ignouQueue.getFailedCount(),
        ]);
        res.json({ success: true, data: { waiting, active, completed, failed, total: waiting + active } });
    } catch (err) { next(err); }
});

// ── GET /api/ignou/results/:batchId ─────────────────────────────────────────
// Paginated per-batch results with optional filters
router.get('/results/:batchId', async (req, res, next) => {
    try {
        const { batchId } = req.params;
        const page   = Math.max(1, parseInt(req.query.page  || '1'));
        const limit  = Math.min(10000, parseInt(req.query.limit || '100')); // high cap: need ALL records for ignouMap
        const status = req.query.status || '';
        const onlyPending = req.query.onlyPending === 'true';

        // Get students in this batch that have ignou checks
        const studentIds = await prisma.student.findMany({
            where: { importBatchId: BigInt(batchId) },
            select: { id: true },
        });
        const ids = studentIds.map(s => s.id);

        const where = {
            studentId: { in: ids },
            ...(status ? { checkStatus: status } : {}),
            ...(onlyPending ? { pendingCount: { gt: 0 } } : {}),
        };

        const [records, total, stats] = await Promise.all([
            prisma.ignouCheck.findMany({
                where,
                orderBy: [{ pendingCount: 'desc' }, { updatedAt: 'desc' }],
                skip: (page - 1) * limit,
                take: limit,
                select: {
                    id: true, studentId: true, enrollmentNo: true, programme: true, studentName: true,
                    checkStatus: true, totalItems: true, submittedCount: true, pendingCount: true,
                    pendingCourses: true, assignmentRows: true, errorMessage: true, checkedAt: true, updatedAt: true,
                },
            }),
            prisma.ignouCheck.count({ where }),
            prisma.ignouCheck.aggregate({
                where: { studentId: { in: ids } },
                _count: { _all: true },
                _sum:   { pendingCount: true, submittedCount: true, totalItems: true },
            }),
        ]);

        // Count by status
        const statusCounts = await prisma.ignouCheck.groupBy({
            by: ['checkStatus'],
            where: { studentId: { in: ids } },
            _count: { _all: true },
        });

        const totalStudents = ids.length;
        const checked   = statusCounts.reduce((a, s) => a + s._count._all, 0);
        const done      = statusCounts.find(s => s.checkStatus === 'DONE')?._count._all    || 0;
        const errors    = statusCounts.find(s => s.checkStatus === 'ERROR')?._count._all   || 0;
        const running   = statusCounts.find(s => s.checkStatus === 'RUNNING')?._count._all || 0;
        const pending   = statusCounts.find(s => s.checkStatus === 'PENDING')?._count._all || 0;
        const notChecked = totalStudents - checked;

        res.json({
            success: true,
            data: {
                records,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
                summary: {
                    totalStudents, checked, done, errors, running, pending, notChecked,
                    totalPendingAssignments: stats._sum.pendingCount   || 0,
                    totalSubmitted:          stats._sum.submittedCount || 0,
                },
            },
        });
    } catch (err) { next(err); }
});

// ── GET /api/ignou/student/:studentId ────────────────────────────────────────
// Single student's latest check result
router.get('/student/:studentId', async (req, res, next) => {
    try {
        const record = await prisma.ignouCheck.findUnique({
            where: { studentId: BigInt(req.params.studentId) },
        });
        res.json({ success: true, data: record });
    } catch (err) { next(err); }
});

// ── POST /api/ignou/retry/batch/:batchId ────────────────────────────────────
// Re-queue all ERROR records in a batch
router.post('/retry/batch/:batchId', async (req, res, next) => {
    try {
        const { batchId } = req.params;
        const studentIds = (await prisma.student.findMany({ where: { importBatchId: BigInt(batchId) }, select: { id: true } })).map(s => s.id);
        const errors = await prisma.ignouCheck.findMany({
            where: { studentId: { in: studentIds }, checkStatus: 'ERROR' },
            select: { studentId: true, enrollmentNo: true, programme: true, studentName: true },
        });
        for (const r of errors) {
            await prisma.ignouCheck.update({ where: { studentId: r.studentId }, data: { checkStatus: 'PENDING', errorMessage: null } });
            await ignouQueue.add({ studentId: r.studentId.toString(), enrollmentNo: r.enrollmentNo, programme: r.programme, studentName: r.studentName });
        }
        res.json({ success: true, data: { requeued: errors.length } });
    } catch (err) { next(err); }
});

// ── DELETE /api/ignou/batch/:batchId ────────────────────────────────────────
// Delete all check records for a batch (allows re-checking from scratch)
router.delete('/batch/:batchId', async (req, res, next) => {
    try {
        const { batchId } = req.params;
        const studentIds = (await prisma.student.findMany({ where: { importBatchId: BigInt(batchId) }, select: { id: true } })).map(s => s.id);
        const { count } = await prisma.ignouCheck.deleteMany({ where: { studentId: { in: studentIds } } });
        res.json({ success: true, data: { deleted: count } });
    } catch (err) { next(err); }
});

// ── GET /api/ignou/export/:batchId ──────────────────────────────────────────
// Export: existing import columns + IGNOU columns as .xlsx
router.get('/export/:batchId', async (req, res, next) => {
    try {
        const { batchId } = req.params;
        const onlyPending = req.query.onlyPending === 'true';

        // Fetch students with their ignou check data
        const students = await prisma.student.findMany({
            where: { importBatchId: BigInt(batchId) },
            select: {
                id: true, fullName: true, enrollmentNo: true, programme: true,
                phone: true, email: true, customFields: true,
                ignouChecks: {
                    select: {
                        checkStatus: true, totalItems: true, submittedCount: true,
                        pendingCount: true, pendingCourses: true, checkedAt: true,
                    },
                },
            },
            orderBy: { id: 'asc' },
        });

        const filtered = onlyPending
            ? students.filter(s => s.ignouChecks[0]?.pendingCount > 0)
            : students;

        // Determine original column order from customFields._columnOrder
        let columnOrder = [];
        for (const s of students) {
            const order = s.customFields?._columnOrder;
            if (Array.isArray(order) && order.length > 0) { columnOrder = order; break; }
        }
        if (columnOrder.length === 0 && students.length > 0) {
            const sample = students[0].customFields || {};
            columnOrder = Object.keys(sample).filter(k => !k.startsWith('_'));
        }

        const workbook  = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('IGNOU Status');

        // Header row: original columns + IGNOU columns
        const ignouHeaders = ['IGNOU Status', 'Total Assignments', 'Submitted', 'Pending Count', 'Pending Courses', 'Last IGNOU Check'];
        const headers = [...columnOrder, ...ignouHeaders];

        worksheet.addRow(headers);

        // Style header
        worksheet.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        worksheet.getRow(1).height = 20;

        // Data rows
        filtered.forEach(student => {
            const cf    = student.customFields || {};
            const check = student.ignouChecks?.[0];

            const originalCells = columnOrder.map(col => {
                const v = cf[col];
                if (v === null || v === undefined) return '';
                if (Array.isArray(v)) return v.join(', ');
                return String(v);
            });

            const igStatus = !check
                ? 'NOT_CHECKED'
                : check.checkStatus === 'DONE' && check.pendingCount > 0 ? 'HAS_PENDING'
                : check.checkStatus;

            const ignouCells = [
                igStatus,
                check?.totalItems    ?? '',
                check?.submittedCount ?? '',
                check?.pendingCount  ?? '',
                check?.pendingCourses || '',
                check?.checkedAt ? new Date(check.checkedAt).toLocaleDateString('en-IN') : '',
            ];

            const rowData = [...originalCells, ...ignouCells];
            const row = worksheet.addRow(rowData);

            // Highlight pending rows in red
            if (check?.pendingCount > 0) {
                const pendingColIdx  = columnOrder.length + 4; // "Pending Count" (1-indexed)
                const coursesColIdx  = columnOrder.length + 5; // "Pending Courses"
                [pendingColIdx, coursesColIdx].forEach(ci => {
                    row.getCell(ci).font = { bold: true, color: { argb: 'FFCC0000' } };
                    row.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F0' } };
                });
            }
        });

        // Auto-width columns
        worksheet.columns.forEach((col, i) => {
            let maxLen = (headers[i] || '').length;
            col.eachCell({ includeEmpty: false }, cell => {
                const len = String(cell.value || '').length;
                if (len > maxLen) maxLen = len;
            });
            col.width = Math.min(Math.max(maxLen + 2, 10), 50);
        });

        // Freeze top row
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="ignou_status_batch_${batchId}_${new Date().toISOString().split('T')[0]}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) { next(err); }
});

export default router;
