/**
 * add-indexes.cjs
 * Run ONCE on production server to add missing indexes that speed up the Data page.
 * Usage: node add-indexes.cjs
 *
 * Safe to run multiple times — uses IF NOT EXISTS.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const indexes = [
        // Data page primary filter: source = 'excel_import'
        `ALTER TABLE students ADD INDEX IF NOT EXISTS idx_students_source (source(20))`,
        // Telecaller filter: assigned_by_id = <telecaller user id>
        `ALTER TABLE students ADD INDEX IF NOT EXISTS idx_students_assigned_by_id (assigned_by_id)`,
        // Multi-batch filter: import_batch_id IN (...)
        `ALTER TABLE students ADD INDEX IF NOT EXISTS idx_students_import_batch_id (import_batch_id)`,
        // Composite: most common telecaller query pattern
        `ALTER TABLE students ADD INDEX IF NOT EXISTS idx_students_source_assigned (source(20), assigned_by_id)`,
        // Status filter (hidden from default view)
        `ALTER TABLE students ADD INDEX IF NOT EXISTS idx_students_status (status(20))`,
        // Guide assignment filter for STAFF
        `ALTER TABLE students ADD INDEX IF NOT EXISTS idx_students_assigned_guide_id (assigned_guide_id)`,
    ];

    for (const sql of indexes) {
        try {
            await prisma.$executeRawUnsafe(sql);
            const label = sql.match(/ADD INDEX IF NOT EXISTS (\S+)/)?.[1] || sql;
            console.log('OK:', label);
        } catch (e) {
            if (e.message.includes('Duplicate key name') || e.message.includes('already exists')) {
                console.log('Already exists - skipped');
            } else {
                console.error('Failed:', e.message);
            }
        }
    }

    const rows = await prisma.$queryRawUnsafe('SHOW INDEX FROM students');
    const names = [...new Set(rows.map(r => r.Key_name))];
    console.log('Current indexes on students:', names.join(', '));
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
