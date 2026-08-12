/**
 * compare-batches.mjs
 * Compare enrollment numbers between two import batches to find duplicates.
 * 
 * Usage:
 *   node compare-batches.mjs <batchId1> <batchId2>
 * 
 * Example:
 *   node compare-batches.mjs 12 15
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const [batchA, batchB] = process.argv.slice(2);

    if (!batchA || !batchB) {
        console.error('\nUsage: node compare-batches.mjs <batchId1> <batchId2>');
        console.error('Example: node compare-batches.mjs 12 15\n');
        console.error('To find your batch IDs, run: node compare-batches.mjs list\n');
        process.exit(1);
    }

    // Special command: list all batches
    if (batchA === 'list') {
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

    console.log(`\n=== Comparing Batch ${batchA} vs Batch ${batchB} ===\n`);

    // Load enrollment numbers from both batches
    const [rowsA, rowsB] = await Promise.all([
        prisma.$queryRaw`
            SELECT enrollment_no FROM students
            WHERE import_batch_id = ${BigInt(batchA)}
              AND enrollment_no IS NOT NULL AND enrollment_no != ''
        `,
        prisma.$queryRaw`
            SELECT enrollment_no FROM students
            WHERE import_batch_id = ${BigInt(batchB)}
              AND enrollment_no IS NOT NULL AND enrollment_no != ''
        `,
    ]);

    const setA = new Set(rowsA.map(r => String(r.enrollment_no).trim().toLowerCase()));
    const setB = new Set(rowsB.map(r => String(r.enrollment_no).trim().toLowerCase()));

    // Find common enrollment numbers
    const duplicates = [...setA].filter(e => setB.has(e));

    console.log(`Batch ${batchA}: ${setA.size.toLocaleString()} rows with enrollment numbers`);
    console.log(`Batch ${batchB}: ${setB.size.toLocaleString()} rows with enrollment numbers`);
    console.log(`\nDuplicate enrollment numbers (in BOTH batches): ${duplicates.length.toLocaleString()}`);

    if (duplicates.length > 0) {
        const pct = ((duplicates.length / Math.min(setA.size, setB.size)) * 100).toFixed(1);
        console.log(`Overlap: ${pct}% of the smaller batch`);
        console.log('\nFirst 10 duplicate enrollment numbers:');
        duplicates.slice(0, 10).forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    } else {
        console.log('\nNo duplicates found — these two files have completely different students.');
    }

    // Also check rows without enrollment numbers
    const [totalA, totalB] = await Promise.all([
        prisma.student.count({ where: { importBatchId: BigInt(batchA) } }),
        prisma.student.count({ where: { importBatchId: BigInt(batchB) } }),
    ]);

    const missingA = totalA - setA.size;
    const missingB = totalB - setB.size;

    if (missingA > 0 || missingB > 0) {
        console.log(`\n⚠ Note: Some rows have no enrollment number (can't be compared):`);
        if (missingA > 0) console.log(`  Batch ${batchA}: ${missingA.toLocaleString()} rows missing enrollment number`);
        if (missingB > 0) console.log(`  Batch ${batchB}: ${missingB.toLocaleString()} rows missing enrollment number`);
        console.log(`  These rows were NOT included in the duplicate check above.`);
    }

    console.log('');
}

main()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
