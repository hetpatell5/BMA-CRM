/**
 * clean-memory.cjs
 * Patches mapping-memory.json:
 *   1. Removes param1..paramN garbage entries
 *   2. Fixes "order date" → enrollmentNo (wrong) → customField.orderDate
 *   3. Fixes "chat" → controlNumber (wrong) → customField.chat
 *   4. Fixes any customField.unknown → customField.<camelKey>
 *   5. Re-maps "program with specification" → programme (real CRM field)
 *   6. Re-maps "program semester" → semester (real CRM field)
 */

const fs   = require('fs');
const path = require('path');

const MEMORY_PATH = path.join(__dirname, '..', 'backend', 'uploads', 'mapping-memory.json');

if (!fs.existsSync(MEMORY_PATH)) {
    console.log('Memory file not found – nothing to clean.');
    process.exit(0);
}

const raw    = fs.readFileSync(MEMORY_PATH, 'utf8');
const memory = JSON.parse(raw);

function toCamelKey(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

// ── Known-bad overrides: key (normalized) → correct value ────────────────────
const FORCE_FIX = {
    'order date':                    'customField.orderDate',
    'chat':                          'customField.chat',
    // These were saved with wrong CRM field from Jaccard false-positives
};

// ── Keys that should always be CRM fields, not custom ─────────────────────────
const FORCE_CRM = {
    'program with specification':    'programme',
    'program with spec':             'programme',
    'programme with specification':  'programme',
    'program semester':              'semester',
    'programme semester':            'semester',
    'session year':                  'batchYear',
    'enrollment number':             'enrollmentNo',
    'enrollment no':                 'enrollmentNo',
    'full name of student':          'fullName',
    'full address with pincode':     'address',
    'email id':                      'email',
    'contact number':                'phone',
    'alternative contact number':    'alternatePhone',
    'require assignment sub code s': 'subjects',
    'require assignment sub codes':  'subjects',
};

let removed = 0;
let fixed   = 0;
const cleaned = {};

for (const [key, val] of Object.entries(memory)) {
    // 1. Remove param<N> garbage
    if (/^param\d+$/.test(key)) {
        removed++;
        continue;
    }

    // 2. Force-fix known bad mappings
    if (FORCE_FIX[key]) {
        const newVal = FORCE_FIX[key];
        if (val !== newVal) {
            console.log(`  FIX  "${key}": "${val}" → "${newVal}"`);
            fixed++;
        }
        cleaned[key] = newVal;
        continue;
    }

    // 3. Force correct CRM field
    if (FORCE_CRM[key]) {
        const newVal = FORCE_CRM[key];
        if (val !== newVal) {
            console.log(`  CRM  "${key}": "${val}" → "${newVal}"`);
            fixed++;
        }
        cleaned[key] = newVal;
        continue;
    }

    // 4. Fix customField.unknown → customField.<camelKey>
    if (val === 'customField.unknown' || val === 'customField.' || val === 'customField.null') {
        const newKey = `customField.${toCamelKey(key)}`;
        console.log(`  KEY  "${key}": "${val}" → "${newKey}"`);
        cleaned[key] = newKey;
        fixed++;
        continue;
    }

    // 5. Keep everything else
    cleaned[key] = val;
}

fs.writeFileSync(MEMORY_PATH, JSON.stringify(cleaned, null, 2), 'utf8');

console.log(`\nDone.`);
console.log(`  Removed: ${removed} garbage entries`);
console.log(`  Fixed:   ${fixed} bad mappings`);
console.log(`  Kept:    ${Object.keys(cleaned).length} clean entries`);
