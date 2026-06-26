/**
 * ignouQueue.js
 * Bull queue with 10 concurrent workers for checking IGNOU assignment status.
 * Crash-safe: on server restart, RUNNING jobs are reset to PENDING and re-enqueued.
 */

import Bull from 'bull';
import prisma from '../config/database.js';
import { checkStudent } from './ignouScraper.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const ignouQueue = new Bull('ignou-check', REDIS_URL, {
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

// Shared progress counters (reset on each new bulk run)
let totalJobs = 0;
let doneJobs  = 0;
let _io       = null;

export function setIo(ioInstance) { _io = ioInstance; }

function emitProgress() {
    if (!_io) return;
    _io.emit('ignou:progress', {
        done:    doneJobs,
        total:   totalJobs,
        percent: totalJobs > 0 ? Math.round((doneJobs / totalJobs) * 100) : 0,
    });
}

// ── 3 concurrent workers (polite rate for IGNOU portal) ────────────────────────────
// 3 workers × 1 req/s = ~3 req/s to IGNOU. Avoids rate-limit / "Not found" blocks.
ignouQueue.process(3, async (job) => {
    const { studentId, enrollmentNo, programme, studentName } = job.data;

    // Mark RUNNING in DB
    await prisma.ignouCheck.upsert({
        where:  { studentId: BigInt(studentId) },
        create: { studentId: BigInt(studentId), enrollmentNo, programme, studentName, checkStatus: 'RUNNING' },
        update: { checkStatus: 'RUNNING', errorMessage: null },
    });

    try {
        const result = await checkStudent(enrollmentNo, programme);

        await prisma.ignouCheck.update({
            where: { studentId: BigInt(studentId) },
            data: {
                checkStatus:    'DONE',
                assignmentRows: result.assignmentRows,
                totalItems:     result.totalItems,
                submittedCount: result.submittedCount,
                pendingCount:   result.pendingCount,
                pendingCourses: result.pendingCourses || null,
                checkedAt:      new Date(),
                errorMessage:   null,
            },
        });
    } catch (err) {
        await prisma.ignouCheck.update({
            where: { studentId: BigInt(studentId) },
            data:  { checkStatus: 'ERROR', errorMessage: err.message || 'Unknown error' },
        });
    }

    doneJobs++;
    emitProgress();

    // Polite 1 second delay per worker to stay under IGNOU rate limit
    // 3 workers × 1 req/s = ~3 req/s, well within IGNOU's tolerance
    await new Promise(resolve => setTimeout(resolve, 1000));
});

// ── Crash Recovery ────────────────────────────────────────────────────────────
/**
 * Call on server startup.
 * 1. Reset RUNNING → PENDING in DB (jobs that were active when server crashed)
 * 2. If Redis queue is empty but DB has PENDING records, re-enqueue them.
 */
export async function initIgnouQueue() {
    try {
        // 1. Reset stuck RUNNING jobs
        const { count: resetCount } = await prisma.ignouCheck.updateMany({
            where: { checkStatus: 'RUNNING' },
            data:  { checkStatus: 'PENDING' },
        });
        if (resetCount > 0) console.log(`[IGNOU] Reset ${resetCount} stuck RUNNING → PENDING`);

        // 2. If Redis queue is empty, re-enqueue all PENDING DB records
        const queueCount = await ignouQueue.count();
        if (queueCount === 0) {
            const pending = await prisma.ignouCheck.findMany({
                where:  { checkStatus: 'PENDING' },
                select: { studentId: true, enrollmentNo: true, programme: true, studentName: true },
            });
            if (pending.length > 0) {
                console.log(`[IGNOU] Re-enqueueing ${pending.length} pending records after restart`);
                totalJobs = pending.length;
                doneJobs  = 0;
                for (const r of pending) {
                    await ignouQueue.add({
                        studentId:   r.studentId.toString(),
                        enrollmentNo: r.enrollmentNo,
                        programme:   r.programme,
                        studentName: r.studentName,
                    });
                }
            }
        } else {
            console.log(`[IGNOU] Queue has ${queueCount} jobs — continuing from checkpoint`);
        }
    } catch (err) {
        console.error('[IGNOU] initIgnouQueue error:', err.message);
    }
}

/**
 * Enqueue all eligible students in an import batch.
 * Skips students already marked DONE.
 * Returns { queued, skipped, noData } counts.
 */
export async function enqueueBatch(batchId) {
    const students = await prisma.student.findMany({
        where: {
            importBatchId: BigInt(batchId),
            enrollmentNo:  { not: null },
            programme:     { not: null },
        },
        select: { id: true, enrollmentNo: true, programme: true, fullName: true },
    });

    // Find which ones are already DONE
    const existingDone = await prisma.ignouCheck.findMany({
        where:  { studentId: { in: students.map(s => s.id) }, checkStatus: 'DONE' },
        select: { studentId: true },
    });
    const doneSet = new Set(existingDone.map(r => r.studentId.toString()));
    const toQueue = students.filter(s => !doneSet.has(s.id.toString()));
    const noData  = students.length === 0 ? (
        await prisma.student.count({ where: { importBatchId: BigInt(batchId) } })
    ) : 0;

    if (toQueue.length === 0) {
        return { queued: 0, skipped: doneSet.size, noData };
    }

    // Reset counters
    totalJobs = toQueue.length;
    doneJobs  = 0;

    // Upsert PENDING records in DB
    for (const s of toQueue) {
        await prisma.ignouCheck.upsert({
            where:  { studentId: s.id },
            create: { studentId: s.id, enrollmentNo: s.enrollmentNo, programme: s.programme, studentName: s.fullName, checkStatus: 'PENDING' },
            update: { checkStatus: 'PENDING', errorMessage: null },
        });
    }

    // Add jobs to queue
    const jobs = toQueue.map(s => ({
        data: { studentId: s.id.toString(), enrollmentNo: s.enrollmentNo, programme: s.programme, studentName: s.fullName },
    }));
    await ignouQueue.addBulk(jobs);

    return { queued: toQueue.length, skipped: doneSet.size, noData };
}

/**
 * Enqueue a single student check.
 */
export async function enqueueStudent(studentId) {
    const student = await prisma.student.findUnique({
        where:  { id: BigInt(studentId) },
        select: { id: true, enrollmentNo: true, programme: true, fullName: true },
    });
    if (!student || !student.enrollmentNo || !student.programme) {
        throw new Error('Student not found or missing enrollmentNo/programme');
    }

    totalJobs++;
    await prisma.ignouCheck.upsert({
        where:  { studentId: student.id },
        create: { studentId: student.id, enrollmentNo: student.enrollmentNo, programme: student.programme, studentName: student.fullName, checkStatus: 'PENDING' },
        update: { checkStatus: 'PENDING', errorMessage: null },
    });
    await ignouQueue.add({
        studentId:   student.id.toString(),
        enrollmentNo: student.enrollmentNo,
        programme:   student.programme,
        studentName: student.fullName,
    });
    return { queued: 1 };
}

/**
 * Enqueue a specific list of student IDs (checkbox-selected rows).
 * Properly RESETS the global counter so the progress bar starts fresh.
 * Skips students already DONE.
 */
export async function enqueueStudentsBulk(studentIds) {
    const bigIds = studentIds.map(id => BigInt(id));

    const students = await prisma.student.findMany({
        where: {
            id:           { in: bigIds },
            enrollmentNo: { not: null },
            programme:    { not: null },
        },
        select: { id: true, enrollmentNo: true, programme: true, fullName: true },
    });

    const missing = studentIds.length - students.length; // no enrollment/programme

    if (students.length === 0) return { queued: 0, skipped: 0, missing };

    // Reset counters for this new run
    totalJobs = students.length;
    doneJobs  = 0;
    emitProgress();

    // Upsert all to PENDING (re-check even if previously done)
    for (const s of students) {
        await prisma.ignouCheck.upsert({
            where:  { studentId: s.id },
            create: { studentId: s.id, enrollmentNo: s.enrollmentNo, programme: s.programme, studentName: s.fullName, checkStatus: 'PENDING' },
            update: { checkStatus: 'PENDING', errorMessage: null },
        });
    }

    const jobs = students.map(s => ({
        data: { studentId: s.id.toString(), enrollmentNo: s.enrollmentNo, programme: s.programme, studentName: s.fullName },
    }));
    await ignouQueue.addBulk(jobs);

    return { queued: students.length, skipped: 0, missing };
}
