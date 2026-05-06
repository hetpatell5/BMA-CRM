const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'frontend', 'lib', 'api.ts');
let content = fs.readFileSync(filePath, 'utf8');

const fixes = [
    // resume: wrong order of path segments
    {
        from: 'resume: (importId: string) => api.get(`/import/${importId}/resume`)',
        to:   'resume: (importId: string) => api.get(`/import/resume/${importId}`)',
    },
    // delete: missing /history/ prefix
    {
        from: 'delete: (importId: string, deleteRecords?: boolean) => api.delete(`/import/${importId}`, { params: { deleteRecords } })',
        to:   'delete: (importId: string, deleteRecords?: boolean) => api.delete(`/import/history/${importId}`, { params: { deleteRecords } })',
    },
    // getDetails: missing /history/ prefix
    {
        from: 'getDetails: (importId: string) => api.get(`/import/${importId}`)',
        to:   'getDetails: (importId: string) => api.get(`/import/history/${importId}`)',
    },
];

let changed = 0;
for (const fix of fixes) {
    if (content.includes(fix.from)) {
        content = content.replace(fix.from, fix.to);
        console.log(`✅ Fixed: ${fix.from.slice(0, 60)}...`);
        changed++;
    } else {
        // Pattern may have escaped arrow in source
        const escaped = fix.from.replace('=>', '\\u003e');
        if (content.includes(escaped)) {
            content = content.replace(escaped, fix.to);
            console.log(`✅ Fixed (escaped): ${fix.from.slice(0, 60)}...`);
            changed++;
        } else {
            console.log(`❌ NOT FOUND: ${fix.from.slice(0, 60)}...`);
        }
    }
}

if (changed > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`\nDone. ${changed} fix(es) applied.`);
} else {
    console.log('\nNo fixes applied — printing current importAPI section for debug:');
    const idx = content.indexOf('export const importAPI');
    console.log(content.slice(idx, idx + 600));
}
