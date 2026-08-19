// Diagnostic: test a minimal student insert to find out what's failing
import prisma from './src/config/database.js';

async function diagnose() {
    console.log('\n=== Import Diagnostic ===\n');

    // 1. Check DB connection
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ DB connection: OK');
    } catch (e) {
        console.error('❌ DB connection FAILED:', e.message);
        process.exit(1);
    }

    // 2. Check students table structure
    try {
        const cols = await prisma.$queryRaw`
            SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'students'
            ORDER BY ORDINAL_POSITION
        `;
        console.log('\n📋 Students table columns:');
        for (const col of cols) {
            console.log(`  ${col.COLUMN_NAME.padEnd(30)} ${col.DATA_TYPE.padEnd(15)} nullable=${col.IS_NULLABLE}`);
        }
    } catch (e) {
        console.error('❌ Failed to read table structure:', e.message);
    }

    // 3. Try inserting a minimal test row
    try {
        const testRow = await prisma.student.create({
            data: {
                fullName: '__DIAGNOSTIC_TEST__',
                source: 'excel_import',
                importBatchId: null,
                createdById: null,
            },
        });
        console.log('\n✅ Minimal insert: OK, id =', testRow.id.toString());
        // Clean up
        await prisma.student.delete({ where: { id: testRow.id } });
        console.log('✅ Cleanup: OK');
    } catch (e) {
        console.error('\n❌ Minimal insert FAILED:', e.message);
        console.error('   This is the root cause of all rows failing during import!');
    }

    // 4. Check if there are any pending migrations
    try {
        const migrations = await prisma.$queryRaw`
            SELECT migration_name, finished_at 
            FROM _prisma_migrations 
            WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
            ORDER BY started_at DESC
            LIMIT 5
        `;
        if (migrations.length > 0) {
            console.log('\n⚠️  PENDING/FAILED MIGRATIONS:');
            for (const m of migrations) {
                console.log(`  ${m.migration_name} — finished_at: ${m.finished_at}`);
            }
        } else {
            console.log('\n✅ No pending migrations');
        }
    } catch (e) {
        console.error('Could not check migrations:', e.message);
    }

    // 5. Check last import error log
    try {
        const lastImport = await prisma.importHistory.findFirst({
            where: { status: { in: ['COMPLETED', 'FAILED'] } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, fileName: true, status: true, failedCount: true, importedCount: true, errorLog: true, createdAt: true },
        });
        if (lastImport) {
            console.log('\n📦 Last import:');
            console.log(`  File: ${lastImport.fileName}`);
            console.log(`  Status: ${lastImport.status}`);
            console.log(`  Imported: ${lastImport.importedCount}, Failed: ${lastImport.failedCount}`);
            if (lastImport.errorLog && lastImport.errorLog.length > 0) {
                console.log('  Error log:');
                for (const err of lastImport.errorLog.slice(0, 5)) {
                    console.log('   ', JSON.stringify(err));
                }
            }
        }
    } catch (e) {
        console.error('Could not check import history:', e.message);
    }

    await prisma.$disconnect();
    console.log('\n=== Diagnostic complete ===\n');
}

diagnose().catch(e => { console.error('Fatal:', e); process.exit(1); });
