/**
 * cleanup-orphans.mjs
 * Run once on the server to delete student rows with no import batch (orphaned).
 * Usage: node cleanup-orphans.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('\n=== Orphan Cleanup Script ===\n');

    // Step 1: Count orphaned rows
    const countResult = await prisma.$queryRaw`
        SELECT COUNT(*) as cnt
        FROM students
        WHERE import_batch_id IS NULL
          AND source = 'excel_import'
    `;
    const orphanCount = Number(countResult[0].cnt);

    console.log(`Found ${orphanCount.toLocaleString()} orphaned rows (import_batch_id IS NULL, source = excel_import)`);

    if (orphanCount === 0) {
        console.log('\nNothing to delete. Your database is already clean!');
        return;
    }

    console.log('\nDeleting orphaned rows...');
    const deleted = await prisma.$executeRaw`
        DELETE FROM students
        WHERE import_batch_id IS NULL
          AND source = 'excel_import'
    `;

    console.log(`\n✅ Done! Deleted ${deleted.toLocaleString()} orphaned rows.`);

    // Step 2: Show final count
    const remaining = await prisma.$queryRaw`
        SELECT COUNT(*) as cnt FROM students WHERE source = 'excel_import'
    `;
    console.log(`Remaining excel_import rows: ${Number(remaining[0].cnt).toLocaleString()}`);
    console.log('\nYour data page should now show the correct count.\n');
}

main()
    .catch(e => { console.error('Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
