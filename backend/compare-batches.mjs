/**
 * compare-batches.mjs
 * Compare enrollment numbers between two import batches to find duplicates.
 * Works whether enrollment numbers are in enrollment_no column OR stored
 * inside custom_fields JSON (when column mapping put them there by mistake).
 *
 * Usage:
 *   node compare-batches.mjs list              → show all batch IDs
 *   node compare-batches.mjs <id1> <id2>       → compare two batches
 *   node compare-batches.mjs diagnose <id>     → show where data is stored for a batch
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Helper: extract enrollment numbers from a batch ──────────────────────────
// First tries the standard enrollment_no column.
// If that's empty, scans custom_fields JSON for common key names.
async function getEnrollmentSet(batchId) {
    const bigId = BigInt(batchId);

    // Try standard column first
    const fromCol = await prisma.$queryRaw`
        SELECT enrollment_no as enroll FROM students
        WHERE import_batch_id = ${bigId}
          AND enrollment_no IS NOT NULL AND enrollment_no != ''
        LIMIT 1
    `;

    if (fromCol.length > 0) {
        // Standard column has data — load all
        const rows = await prisma.$queryRaw`
            SELECT enrollment_no as enroll FROM students
            WHERE import_batch_id = ${bigId}
              AND enrollment_no IS NOT NULL AND enrollment_no != ''
        `;
        return {
            set: new Set(rows.map(r => String(r.enroll).trim().toLowerCase())),
            source: 'enrollment_no column',
        };
    }

    // Standard column is empty — try custom_fields JSON
    // Try the most common key names used by IGNOU files
    const customKeys = ['Enrolment Number', 'Enrollment Number', 'enrollmentNo', 'ENROLMENT NUMBER', 'ENROLLMENT NUMBER'];

    for (const key of customKeys) {
        const sample = await prisma.$queryRaw`
            SELECT JSON_UNQUOTE(JSON_EXTRACT(custom_fields, ${`$."${key}"`})) as enroll
            FROM students
            WHERE import_batch_id = ${bigId}
              AND JSON_EXTRACT(custom_fields, ${`$."${key}"`}) IS NOT NULL
              AND JSON_UNQUOTE(JSON_EXTRACT(custom_fields, ${`$."${key}"`})) != ''
              AND JSON_UNQUOTE(JSON_EXTRACT(custom_fields, ${`$."${key}"`})) != 'null'
            LIMIT 1
        `;

        if (sample.length > 0) {
            // Found the key — load all
            const rows = await prisma.$queryRaw`
                SELECT JSON_UNQUOTE(JSON_EXTRACT(custom_fields, ${`$."${key}"`})) as enroll
                FROM students
                WHERE import_batch_id = ${bigId}
                  AND JSON_EXTRACT(custom_fields, ${`$."${key}"`}) IS NOT NULL
                  AND JSON_UNQUOTE(JSON_EXTRACT(custom_fields, ${`$."${key}"`})) != ''
                  AND JSON_UNQUOTE(JSON_EXTRACT(custom_fields, ${`$."${key}"`})) != 'null'
            `;
            return {
                set: new Set(rows.map(r => String(r.enroll).trim().toLowerCase())),
                source: `custom_fields["${key}"]`,
            };
        }
    }

    return { set: new Set(), source: 'NOT FOUND' };
}

async function main() {
    const [cmd, arg2] = process.argv.slice(2);

    if (!cmd) {
        console.log('\nUsage:');
        console.log('  node compare-batches.mjs list              → list all batches');
        console.log('  node compare-batches.mjs <id1> <id2>       → compare two batches');
        console.log('  node compare-batches.mjs diagnose <id>     → show where data is stored\n');
        process.exit(1);
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (cmd === 'list') {
        const batches = await prisma.importHistory.findMany({
            where: { status: 'COMPLETED' },
            select: { id: true, fileName: true, importedCount: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        console.log('\n=== Your Import Batches ===\n');
        batches.forEach(b => {
            console.log(`  ID: ${b.id}  |  ${b.fileName}  |  ${b.importedCount?.toLocaleString()} rows  |  ${b.createdAt.toLocaleDateString()}`);
        });
        console.log('');
        return;
    }

    // ── DIAGNOSE ─────────────────────────────────────────────────────────────
    if (cmd === 'diagnose') {
        if (!arg2) { console.error('Usage: node compare-batches.mjs diagnose <batchId>'); process.exit(1); }
        console.log(`\n=== Diagnosing Batch ${arg2} ===\n`);
        const total = await prisma.student.count({ where: { importBatchId: BigInt(arg2) } });
        console.log(`Total rows: ${total.toLocaleString()}`);

        // Check enrollment_no column
        const fromCol = await prisma.$queryRaw`
            SELECT COUNT(*) as cnt FROM students
            WHERE import_batch_id = ${BigInt(arg2)}
              AND enrollment_no IS NOT NULL AND enrollment_no != ''
        `;
        console.log(`enrollment_no column populated: ${Number(fromCol[0].cnt).toLocaleString()} rows`);

        // Check custom_fields keys
        const sample = await prisma.$queryRaw`
            SELECT custom_fields FROM students
            WHERE import_batch_id = ${BigInt(arg2)}
              AND custom_fields IS NOT NULL
            LIMIT 1
        `;
        if (sample.length > 0 && sample[0].custom_fields) {
            const cf = typeof sample[0].custom_fields === 'string'
                ? JSON.parse(sample[0].custom_fields)
                : sample[0].custom_fields;
            console.log(`\ncustom_fields keys found in this batch:`);
            Object.keys(cf).filter(k => k !== '_columnOrder').forEach(k => {
                console.log(`  → "${k}"`);
            });
        }

        const { set, source } = await getEnrollmentSet(arg2);
        console.log(`\nEnrollment numbers found: ${set.size.toLocaleString()} (source: ${source})`);
        if (set.size > 0) {
            const samples = [...set].slice(0, 5);
            console.log(`Sample values: ${samples.join(', ')}`);
        }
        console.log('');
        return;
    }

    // ── COMPARE ───────────────────────────────────────────────────────────────
    const batchA = cmd;
    const batchB = arg2;

    if (!batchB) {
        console.error('\nError: Please provide a second batch ID.');
        console.error('Usage: node compare-batches.mjs <batchId1> <batchId2>\n');
        process.exit(1);
    }

    console.log(`\n=== Comparing Batch ${batchA} vs Batch ${batchB} ===\n`);
    console.log('Loading enrollment numbers (checking both enrollment_no column and custom_fields)...\n');

    const [resultA, resultB] = await Promise.all([
        getEnrollmentSet(batchA),
        getEnrollmentSet(batchB),
    ]);

    const { set: setA, source: srcA } = resultA;
    const { set: setB, source: srcB } = resultB;

    const [totalA, totalB] = await Promise.all([
        prisma.student.count({ where: { importBatchId: BigInt(batchA) } }),
        prisma.student.count({ where: { importBatchId: BigInt(batchB) } }),
    ]);

    console.log(`Batch ${batchA}: ${setA.size.toLocaleString()} enrollment numbers found  [from: ${srcA}]`);
    console.log(`Batch ${batchB}: ${setB.size.toLocaleString()} enrollment numbers found  [from: ${srcB}]`);

    if (setA.size === 0 || setB.size === 0) {
        console.log(`\n⚠ Cannot compare — one or both batches have no detectable enrollment numbers.`);
        console.log(`  Run: node compare-batches.mjs diagnose ${setA.size === 0 ? batchA : batchB}`);
        console.log(`  to see what fields are available in that batch.\n`);
        return;
    }

    const duplicates = [...setA].filter(e => setB.has(e));

    console.log(`\nDuplicate enrollment numbers (in BOTH batches): ${duplicates.length.toLocaleString()}`);

    if (duplicates.length > 0) {
        const pct = ((duplicates.length / Math.min(setA.size, setB.size)) * 100).toFixed(1);
        console.log(`Overlap: ${pct}% of the smaller batch`);
        console.log('\nFirst 10 duplicate enrollment numbers:');
        duplicates.slice(0, 10).forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    } else {
        console.log('\nNo duplicates found — these two files have completely different students.');
    }

    const missingA = totalA - setA.size;
    const missingB = totalB - setB.size;
    if (missingA > 0 || missingB > 0) {
        console.log(`\n⚠ Rows with no enrollment number (excluded from comparison):`);
        if (missingA > 0) console.log(`  Batch ${batchA}: ${missingA.toLocaleString()} rows`);
        if (missingB > 0) console.log(`  Batch ${batchB}: ${missingB.toLocaleString()} rows`);
    }
    console.log('');
}

main()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
