/**
 * smartMapper.js  — v2  (permanent fix)
 *
 * 3-level matching with memory learning + business-column protection.
 *
 *  Level 0 — Memory  (confidence 100%, "memory")
 *  Level 1 — Exact alias  (confidence 100%, "exact")
 *  Level 2 — Fuzzy Jaccard token similarity  (confidence %, "fuzzy")
 *  Level 3 — Data-type sniff  (confidence 40%, "sniff")
 *  Fallback — customField.<camelKey>  (confidence 0%, "custom")
 *
 *  Key design rule:
 *    Columns in ALWAYS_CUSTOM are sent to customField REGARDLESS of any
 *    match — these are operational/payment columns that must never overwrite
 *    core CRM student fields.
 *
 *    When memory stores a `customField.*` value, we correctly detect it as
 *    a custom field and extract the right `customFieldKey`.
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_PATH = path.join(__dirname, '../../uploads/mapping-memory.json');

// ─── Columns that must ALWAYS become custom fields ────────────────────────────
// These are order-management / payment / operational columns.
// No matter how similar their name looks to a CRM field, never map them there.
const ALWAYS_CUSTOM = new Set([
    // order info
    'order date', 'order by', 'order date  payment date',
    // communication / ops
    'chat', 'remark', 'remarks', 'notes', 'note', 'comment', 'comments',
    'description',
    // assignment counts / pricing
    'total assignment', 'total assignments', 'total how many assignments',
    'price per assignment', 'price per charge', 'price',
    'require assignment subject codes', 'require assignment sub codes',
    'require assignments subject codes', 'require assignments sub codes',
    // payment columns
    'advance payment', 'advance payment date',
    'total payment', 'total payments',
    'pending payment', 'pending payments',
    'receive pending payment', 'receive pending payment date',
    'received pending payment', 'received pending payment date',
    'payment date',
    // courier / dispatch
    'courier charge', 'courier charges', 'courier details', 'courier detail',
    'awb num', 'awb number', 'awb no',
    // assignment / work columns
    'assign to', 'assigned to', 'assigned',
    'requirement', 'requirement in', 'requirement in soft hw guess',
    'require qualification', 'qualification required',
    // language (not a student field in DB)
    'language', 'languages', 'medium',
]);

// ─── Alias dictionary ─────────────────────────────────────────────────────────
// Keys: lowercase, no punctuation, collapsed whitespace
// Values: CRM field names
const FIELD_ALIASES = {
    // ── fullName ──────────────────────────────────────────────────────────────
    name:                                'fullName',
    'full name':                         'fullName',
    fullname:                            'fullName',
    'student name':                      'fullName',
    'full name of student':              'fullName',
    'name of student':                   'fullName',
    'candidate name':                    'fullName',
    'applicant name':                    'fullName',
    'customer name':                     'fullName',
    'customers name':                    'fullName',

    // ── enrollmentNo ──────────────────────────────────────────────────────────
    'enrollment no':                     'enrollmentNo',
    'enrollment number':                 'enrollmentNo',
    'enroll no':                         'enrollmentNo',
    'enrolment no':                      'enrollmentNo',
    'enrolment number':                  'enrollmentNo',
    'roll no':                           'enrollmentNo',
    'roll number':                       'enrollmentNo',
    'reg no':                            'enrollmentNo',
    'registration no':                   'enrollmentNo',
    'registration number':               'enrollmentNo',
    'regno':                             'enrollmentNo',
    'enrollment':                        'enrollmentNo',
    'enroll':                            'enrollmentNo',
    'enrollment no.':                    'enrollmentNo',

    // ── controlNumber ─────────────────────────────────────────────────────────
    'control number':                    'controlNumber',
    'control no':                        'controlNumber',
    'control':                           'controlNumber',
    'ctrl no':                           'controlNumber',
    'ctrl':                              'controlNumber',
    'ctrl number':                       'controlNumber',
    'controlno':                         'controlNumber',
    'cntrl':                             'controlNumber',
    'student control':                   'controlNumber',

    // ── phone ─────────────────────────────────────────────────────────────────
    phone:                               'phone',
    mobile:                              'phone',
    'phone no':                          'phone',
    'phone number':                      'phone',
    'contact number':                    'phone',
    'contact no':                        'phone',
    'mobile no':                         'phone',
    'mobile number':                     'phone',
    'mob no':                            'phone',
    contact:                             'phone',
    cell:                                'phone',
    'cell no':                           'phone',
    whatsapp:                            'phone',
    'whatsapp number':                   'phone',
    'ph no':                             'phone',

    // ── alternatePhone ────────────────────────────────────────────────────────
    'alternate phone':                   'alternatePhone',
    'alternate number':                  'alternatePhone',
    'alternative phone':                 'alternatePhone',
    'alternative number':                'alternatePhone',
    'alternative contact number':        'alternatePhone',
    'alternate contact number':          'alternatePhone',
    'alt phone':                         'alternatePhone',
    'alt mobile':                        'alternatePhone',
    'alt contact':                       'alternatePhone',
    'secondary phone':                   'alternatePhone',
    'other contact':                     'alternatePhone',

    // ── email ─────────────────────────────────────────────────────────────────
    email:                               'email',
    'email id':                          'email',
    'email address':                     'email',
    'mail id':                           'email',
    emailid:                             'email',
    'e-mail':                            'email',
    'email-id':                          'email',

    // ── alternateEmail ────────────────────────────────────────────────────────
    'alternate email':                   'alternateEmail',
    'alternative email':                 'alternateEmail',
    'alt email':                         'alternateEmail',
    'secondary email':                   'alternateEmail',
    'other email':                       'alternateEmail',

    // ── programme ─────────────────────────────────────────────────────────────
    programme:                           'programme',
    program:                             'programme',
    prog:                                'programme',
    'program name':                      'programme',
    'programme name':                    'programme',
    'course programme':                  'programme',
    'program name with year':            'programme',
    'program with specification':        'programme',
    'program with spec':                 'programme',
    'programme with specification':      'programme',

    // ── course ────────────────────────────────────────────────────────────────
    course:                              'course',
    'course name':                       'course',
    stream:                              'course',

    // ── specialization ────────────────────────────────────────────────────────
    specialization:                      'specialization',
    specialisation:                      'specialization',
    spec:                                'specialization',

    // ── semester ──────────────────────────────────────────────────────────────
    semester:                            'semester',
    sem:                                 'semester',
    'require semester':                  'semester',
    'current semester':                  'semester',
    'semester no':                       'semester',
    'program semester':                  'semester',
    'programme semester':                'semester',
    semesters:                           'semester',
    'present semester':                  'semester',
    'present semester  year':            'semester',

    // ── batchYear ─────────────────────────────────────────────────────────────
    batch:                               'batchYear',
    'batch year':                        'batchYear',
    year:                                'batchYear',
    'session year':                      'batchYear',
    session:                             'batchYear',
    'year of admission':                 'batchYear',
    'admission year':                    'batchYear',

    // ── regionalCenter ────────────────────────────────────────────────────────
    'regional center':                   'regionalCenter',
    'regional centre':                   'regionalCenter',
    center:                              'regionalCenter',
    centre:                              'regionalCenter',
    rc:                                  'regionalCenter',
    'center code':                       'regionalCenter',
    'study center':                      'regionalCenter',
    'study centre':                      'regionalCenter',

    // ── address ───────────────────────────────────────────────────────────────
    address:                             'address',
    'full address':                      'address',
    'full address with pincode':         'address',
    'postal address':                    'address',
    'postal address with pincode':       'address',
    'home address':                      'address',

    // ── city ──────────────────────────────────────────────────────────────────
    city:                                'city',
    town:                                'city',
    district:                            'city',

    // ── state ─────────────────────────────────────────────────────────────────
    state:                               'state',
    province:                            'state',

    // ── pincode ───────────────────────────────────────────────────────────────
    pincode:                             'pincode',
    'pin code':                          'pincode',
    zip:                                 'pincode',
    'zip code':                          'pincode',
    'postal code':                       'pincode',

    // ── gender ────────────────────────────────────────────────────────────────
    gender:                              'gender',
    sex:                                 'gender',

    // ── dateOfBirth ───────────────────────────────────────────────────────────
    dob:                                 'dateOfBirth',
    'date of birth':                     'dateOfBirth',
    'date_of_birth':                     'dateOfBirth',
    'birth date':                        'dateOfBirth',
    birthday:                            'dateOfBirth',

    // ── admissionDate ─────────────────────────────────────────────────────────
    'admission date':                    'admissionDate',
    'joining date':                      'admissionDate',
    'date of admission':                 'admissionDate',

    // ── subjects (crs1-crs25 handled dynamically below) ───────────────────────
    subject:                             'subjects',
    subjects:                            'subjects',
    'sub code':                          'subjects',
    'sub codes':                         'subjects',
    'subject codes':                     'subjects',
    'require assignment sub code s':     'subjects',   // apostrophe stripped
    'require assignment sub codes':      'subjects',
    'require assignments sub codes':     'subjects',
    'require assignment subject codes':  'subjects',
    'require assignments subject codes': 'subjects',
    'i sub codes':                       'subjects',
    'i sub code':                        'subjects',
};

// Add crs1..crs25 dynamically
for (let i = 1; i <= 25; i++) {
    FIELD_ALIASES[`crs${i}`]     = 'subjects';
    FIELD_ALIASES[`crs ${i}`]    = 'subjects';
    FIELD_ALIASES[`course${i}`]  = 'subjects';
}

// ─── Keyword sets for Jaccard / token similarity ──────────────────────────────
const FIELD_KEYWORDS = {
    fullName:        new Set(['full', 'name', 'student', 'candidate', 'applicant', 'customer']),
    enrollmentNo:    new Set(['enrollment', 'enroll', 'enrolment', 'roll', 'registration', 'reg', 'number']),
    controlNumber:   new Set(['control', 'ctrl', 'cntrl']),
    phone:           new Set(['phone', 'mobile', 'contact', 'cell', 'mob', 'whatsapp']),
    alternatePhone:  new Set(['alternate', 'alternative', 'alt', 'secondary', 'other', 'phone', 'mobile', 'contact']),
    email:           new Set(['email', 'mail']),
    alternateEmail:  new Set(['alternate', 'alternative', 'alt', 'secondary', 'email', 'mail']),
    programme:       new Set(['programme', 'program', 'prog', 'degree']),
    course:          new Set(['course', 'stream']),
    specialization:  new Set(['specialization', 'specialisation', 'spec', 'major']),
    semester:        new Set(['semester', 'sem', 'term']),
    batchYear:       new Set(['batch', 'year', 'session', 'admission']),
    regionalCenter:  new Set(['regional', 'center', 'centre', 'rc', 'study']),
    address:         new Set(['address', 'postal', 'home', 'residential']),
    city:            new Set(['city', 'town', 'district']),
    state:           new Set(['state', 'province']),
    pincode:         new Set(['pincode', 'pin', 'zip', 'postal']),
    gender:          new Set(['gender', 'sex']),
    dateOfBirth:     new Set(['dob', 'birth', 'birthday', 'born']),
    admissionDate:   new Set(['admission', 'joining']),
    subjects:        new Set(['subject', 'crs', 'sub']),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(str) {
    return String(str)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toCamelKey(str) {
    const words = normalize(str).split(' ').filter(Boolean);
    return words.map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function jaccard(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1;
    const union = new Set([...setA, ...setB]);
    let inter = 0;
    for (const t of union) {
        if (setA.has(t) && setB.has(t)) inter++;
    }
    return inter / union.size;
}

function sniffDataType(samples) {
    const nonEmpty = samples.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (nonEmpty.length === 0) return null;

    const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const PHONE_RE = /^[\d\s\-+()]{8,15}$/;
    const DATE_RE  = /\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}/;

    let emailCount = 0, phoneCount = 0, dateCount = 0, numCount = 0;
    for (const v of nonEmpty) {
        const s = String(v).trim();
        if (EMAIL_RE.test(s)) emailCount++;
        else if (PHONE_RE.test(s) && /\d{7,}/.test(s)) phoneCount++;
        else if (DATE_RE.test(s)) dateCount++;
        else if (/^\d+$/.test(s.replace(/,/g, ''))) numCount++;
    }
    const total = nonEmpty.length;
    if (emailCount / total >= 0.6) return 'email';
    if (phoneCount / total >= 0.6) return 'phone';
    if (dateCount  / total >= 0.6) return 'date';
    if (numCount   / total >= 0.6) return 'number';
    return null;
}

// ─── Memory helpers ───────────────────────────────────────────────────────────

function loadMemory() {
    try {
        if (fs.existsSync(MEMORY_PATH)) {
            return JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
        }
    } catch (_) {}
    return {};
}

function saveMemory(memory) {
    try {
        const dir = path.dirname(MEMORY_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), 'utf8');
    } catch (e) {
        console.error('[smartMapper] Could not save memory:', e.message);
    }
}

// ─── Core mapping function ────────────────────────────────────────────────────

/**
 * Map a list of headers to CRM fields.
 * Returns an array of MappingResult objects, one per header.
 */
export function mapHeaders(headers, previewRows = [], importType = 'ORDERS') {
    const memory     = loadMemory();
    const results    = [];
    const usedFields = new Set(); // prevent duplicate CRM field assignments

    for (let i = 0; i < headers.length; i++) {
        const originalHeader = String(headers[i] || '').trim();

        // ── Empty column ───────────────────────────────────────────────────────
        if (!originalHeader) {
            results.push({
                index: i, originalHeader,
                field: '__skip__', confidence: 0,
                matchType: 'empty', isCustomField: false,
                customFieldKey: null, displayLabel: '(empty column)',
            });
            continue;
        }

        const norm      = normalize(originalHeader);
        const camelKey  = toCamelKey(originalHeader);

        // ── ALWAYS_CUSTOM gate ─────────────────────────────────────────────────
        // If this column is in the protected business-columns list, send it
        // straight to custom field — skip ALL matching levels.
        if (ALWAYS_CUSTOM.has(norm)) {
            results.push({
                index: i, originalHeader,
                field: `customField.${camelKey}`,
                confidence: 100,
                matchType: 'protected',
                isCustomField: true,
                customFieldKey: camelKey,
                displayLabel: originalHeader,
            });
            continue;
        }

        let field      = null;
        let confidence = 0;
        let matchType  = 'none';

        // ── Level 0: Memory ────────────────────────────────────────────────────
        const memVal = memory[norm];
        if (memVal && memVal !== '__skip__') {
            field      = memVal;
            confidence = 100;
            matchType  = 'memory';
        }

        // ── Level 1: Exact alias ───────────────────────────────────────────────
        if (!field && FIELD_ALIASES[norm]) {
            field      = FIELD_ALIASES[norm];
            confidence = 100;
            matchType  = 'exact';
        }

        // ── Level 2: Fuzzy token / Jaccard ────────────────────────────────────
        if (!field) {
            const headerTokens = new Set(norm.split(' ').filter(t => t.length > 1));
            let bestScore = 0;
            let bestField = null;
            for (const [fieldName, fieldTokens] of Object.entries(FIELD_KEYWORDS)) {
                const score = jaccard(headerTokens, fieldTokens);
                if (score > bestScore) {
                    bestScore = score;
                    bestField = fieldName;
                }
            }
            if (bestScore >= 0.55) {
                field      = bestField;
                confidence = Math.round(bestScore * 100);
                matchType  = 'fuzzy';
            } else if (bestScore >= 0.30) {
                field      = bestField;
                confidence = Math.round(bestScore * 100);
                matchType  = 'fuzzy-low';
            }
        }

        // ── Level 3: Data-type sniff ───────────────────────────────────────────
        if (!field || matchType === 'fuzzy-low') {
            const samples  = previewRows.map(row =>
                Array.isArray(row) ? row[i] : row[originalHeader]
            );
            const dataType = sniffDataType(samples);
            if (dataType === 'email' && !field) {
                field      = usedFields.has('email') ? 'alternateEmail' : 'email';
                confidence = 40;
                matchType  = 'sniff';
            } else if (dataType === 'phone' && !field) {
                field      = usedFields.has('phone') ? 'alternatePhone' : 'phone';
                confidence = 40;
                matchType  = 'sniff';
            } else if (dataType === 'number' && !field) {
                field      = usedFields.has('enrollmentNo') ? 'controlNumber' : 'enrollmentNo';
                confidence = 35;
                matchType  = 'sniff';
            }
        }

        // ── Deduplication (except subjects) ───────────────────────────────────
        if (field && field !== 'subjects' && matchType !== 'memory' && matchType !== 'exact') {
            if (usedFields.has(field)) {
                field      = null;
                confidence = 0;
                matchType  = 'duplicate';
            }
        }
        if (field && field !== '__skip__') usedFields.add(field);

        // ── Determine if this resolves to a custom field ───────────────────────
        // A field is a custom field if:
        //   a) No match was found, OR
        //   b) The (memory/alias) matched value itself is a customField.* string
        const isCustomField =
            !field ||
            field === '__skip__' ||
            confidence === 0      ||
            field.startsWith('customField.');

        let resolvedCustomKey = null;
        let resolvedField     = field;

        if (isCustomField) {
            if (field && field.startsWith('customField.')) {
                // Already a customField value (e.g. from memory)
                resolvedCustomKey = field.replace('customField.', '');
                // Fix "unknown" leftover from old buggy runs
                if (!resolvedCustomKey || resolvedCustomKey === 'unknown') {
                    resolvedCustomKey = camelKey;
                }
            } else {
                resolvedCustomKey = camelKey;
            }
            resolvedField = `customField.${resolvedCustomKey}`;
        }

        results.push({
            index:          i,
            originalHeader,
            field:          resolvedField,
            confidence:     isCustomField && !field?.startsWith('customField.') ? 0 : confidence,
            matchType:      isCustomField && !field?.startsWith('customField.') ? 'custom' : matchType,
            isCustomField,
            customFieldKey: resolvedCustomKey,
            displayLabel:   originalHeader,
        });
    }

    return results;
}

/**
 * Convert mapHeaders results to { colIndex: fieldName } for the frontend.
 * Excludes empty/skip columns.
 */
export function resultsToSuggestedMappings(results) {
    const out = {};
    for (const r of results) {
        if (r.field && r.field !== '__skip__') {
            out[r.index] = r.field;
        }
    }
    return out;
}

/**
 * Persist a confirmed column→field mapping to memory.
 * Filters out skip/empty values and fixes 'customField.unknown' entries.
 * Called after a successful import.
 *
 * @param {Record<string, string>} confirmedMappings  { originalHeader: fieldName }
 */
export function learnMappings(confirmedMappings) {
    const memory = loadMemory();
    for (const [rawHeader, field] of Object.entries(confirmedMappings)) {
        if (!rawHeader || !field) continue;
        if (field === '__skip__' || field === '') continue;

        const key = normalize(rawHeader);
        if (!key) continue;

        // If it resolves to customField.unknown (old bug), regenerate the key
        let storedField = field;
        if (field === 'customField.unknown' || field === 'customField.') {
            storedField = `customField.${toCamelKey(rawHeader)}`;
        }

        // Don't store noise / garbage keys
        if (key.startsWith('param') && /^param\d+$/.test(key)) continue;

        memory[key] = storedField;
    }
    saveMemory(memory);
}
