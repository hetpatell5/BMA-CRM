import { readSettings, writeSettings } from '../routes/appSettingsRoutes.js';

export const ORDER_ID_FIELD = 'Order ID';
const ORDER_ID_PREFIX_FIELD = '_orderIdPrefix';
const ORDER_ID_REQUIREMENT_FIELD = '_orderIdRequirement';
const ORDER_ID_GENERATED_FIELD = '_orderIdGenerated';
const ORDER_ID_SIGNATURE_FIELD = '_orderIdSignature';

const REQUIREMENT_KEYS = [
    'requirement of',
    'requirement in',
    'product type',
    'requirement',
];

function normalizeComparable(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function editDistance(a, b) {
    const left = normalizeComparable(a);
    const right = normalizeComparable(b);
    if (left === right) return 0;
    if (!left) return right.length;
    if (!right) return left.length;

    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array(right.length + 1).fill(0);

    for (let i = 1; i <= left.length; i += 1) {
        current[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + cost,
            );
        }
        for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
    }

    return previous[right.length];
}

function isCloseRequirementMatch(requirement, ruleRequirement) {
    const normalizedRequirement = normalizeComparable(requirement);
    const normalizedRule = normalizeComparable(ruleRequirement);
    if (!normalizedRequirement || !normalizedRule) return false;
    if (normalizedRequirement === normalizedRule) return true;
    if (normalizedRequirement.includes(normalizedRule) || normalizedRule.includes(normalizedRequirement)) return true;

    const distance = editDistance(normalizedRequirement, normalizedRule);
    const allowedDistance = Math.min(2, Math.max(1, Math.floor(Math.max(normalizedRequirement.length, normalizedRule.length) / 4)));
    return distance <= allowedDistance;
}

function customFieldText(customFields, ...keywords) {
    if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return '';

    const entries = Object.entries(customFields);
    for (const keyword of keywords) {
        const normalizedKeyword = normalizeComparable(keyword);
        const exact = entries.find(([key, value]) => (
            normalizeComparable(key) === normalizedKeyword &&
            value !== null &&
            value !== undefined &&
            typeof value !== 'object'
        ));
        if (exact) return String(exact[1]).trim();

        const partial = entries.find(([key, value]) => (
            normalizeComparable(key).includes(normalizedKeyword) &&
            value !== null &&
            value !== undefined &&
            typeof value !== 'object'
        ));
        if (partial) return String(partial[1]).trim();
    }

    return '';
}

function requirementTokens(requirement) {
    return String(requirement || '')
        .split(/[,/|+&]/)
        .map(part => part.trim().replace(/^[()[\]{}]+|[()[\]{}]+$/g, '').trim())
        .filter(Boolean);
}

export function normalizeOrderIdPrefix(prefix) {
    const normalized = String(prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return normalized.slice(0, 12);
}

function parseOrderIdSeed(seed) {
    const normalized = normalizeOrderIdPrefix(seed);
    if (!normalized) return null;

    const match = normalized.match(/^([A-Z0-9]*?)(\d+)$/);
    if (!match || !match[1]) {
        return { prefix: normalized, start: 1, width: 3, seed: normalized };
    }

    return {
        prefix: match[1],
        start: Number(match[2]) || 1,
        width: Math.max(match[2].length, 3),
        seed: normalized,
    };
}

export function getRequirementsFromCustomFields(customFields) {
    return requirementTokens(customFieldText(customFields, ...REQUIREMENT_KEYS));
}

export function getOrderIdRuleForRequirement(requirement, settings = readSettings()) {
    const requirementText = String(requirement || '').trim();
    if (!requirementText) return null;

    const normalizedRequirement = normalizeComparable(requirementText);
    const rules = Array.isArray(settings.orderIdRules) ? settings.orderIdRules : [];

    const exact = rules.find(rule => normalizeComparable(rule.requirement) === normalizedRequirement);
    const partial = exact || rules.find(rule => isCloseRequirementMatch(requirementText, rule.requirement));

    const parsedSeed = parseOrderIdSeed(partial?.prefix);
    if (!partial || !parsedSeed) return null;

    return {
        requirement: requirementText,
        ruleRequirement: partial.requirement,
        ...parsedSeed,
    };
}

function parseSequence(orderId, prefix) {
    const raw = String(orderId || '').trim();
    const candidate = raw.includes('-') ? raw.split('-').pop().trim() : raw;
    const match = candidate.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i'));
    return match ? Number(match[1]) : 0;
}

function parseMaxSequenceFromText(text, prefix) {
    return String(text || '')
        .split(/[,/|]/)
        .map(part => parseSequence(part.trim(), prefix))
        .reduce((max, seq) => Math.max(max, seq), 0);
}

async function findMaxExistingSequence(prisma, prefix) {
    if (!prefix) return 0;

    const candidates = await prisma.student.findMany({
        where: {
            OR: [
                { controlNumber: { contains: prefix } },
                { customFields: { string_contains: prefix } },
            ],
        },
        select: { controlNumber: true, customFields: true },
        take: 10000,
        orderBy: { createdAt: 'desc' },
    });

    return candidates.reduce((max, student) => {
        const cf = student.customFields && typeof student.customFields === 'object' ? student.customFields : {};
        const isGenerated = cf[ORDER_ID_GENERATED_FIELD] === true;
        const generatedOrderId = isGenerated ? (cf[ORDER_ID_FIELD] || student.controlNumber) : '';
        return Math.max(
            max,
            parseMaxSequenceFromText(generatedOrderId, prefix),
        );
    }, 0);
}

function formatOrderIdDisplay(rules, orderIds) {
    if (rules.length <= 1) return orderIds[0] || '';

    return rules
        .map((rule, index) => `${rule.ruleRequirement || rule.requirement}-${orderIds[index]}`)
        .join(', ');
}

function extractExistingGeneratedIds(existingOrderId, rules) {
    const parts = String(existingOrderId || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);

    if (parts.length !== rules.length) return null;

    const ids = parts.map((part, index) => {
        const rawId = part.includes('-') ? part.split('-').pop().trim() : part;
        return parseSequence(rawId, rules[index].prefix) ? rawId.toUpperCase() : null;
    });

    return ids.every(Boolean) ? ids : null;
}

async function nextOrderId(prisma, rule, settings) {
    const counters = settings.orderIdCounters && typeof settings.orderIdCounters === 'object'
        ? { ...settings.orderIdCounters }
        : {};
    const currentCounter = Number(counters[rule.prefix]);
    const currentGeneratedMax = await findMaxExistingSequence(prisma, rule.prefix);
    const currentMax = Math.max(
        Number.isFinite(currentCounter) ? currentCounter : 0,
        rule.start - 1,
        currentGeneratedMax,
    );
    const next = currentMax + 1;

    counters[rule.prefix] = next;
    settings.orderIdCounters = counters;
    const latestSettings = readSettings();
    writeSettings({
        ...latestSettings,
        orderIdRules: Array.isArray(latestSettings.orderIdRules) && latestSettings.orderIdRules.length
            ? latestSettings.orderIdRules
            : settings.orderIdRules,
        orderIdCounters: counters,
    });

    return `${rule.prefix}${String(next).padStart(rule.width, '0')}`;
}

export async function ensureOrderIdForCustomFields(prisma, customFields, existingCustomFields = null, existingControlNumber = null, settingsOverride = null) {
    const nextFields = customFields && typeof customFields === 'object' && !Array.isArray(customFields)
        ? { ...customFields }
        : {};
    const previousFields = existingCustomFields && typeof existingCustomFields === 'object' && !Array.isArray(existingCustomFields)
        ? existingCustomFields
        : {};
    const hadOrderIdFields = [
        ORDER_ID_FIELD,
        ORDER_ID_PREFIX_FIELD,
        ORDER_ID_REQUIREMENT_FIELD,
        ORDER_ID_GENERATED_FIELD,
        ORDER_ID_SIGNATURE_FIELD,
    ].some(field => Object.prototype.hasOwnProperty.call(nextFields, field));

    delete nextFields[ORDER_ID_FIELD];
    delete nextFields[ORDER_ID_PREFIX_FIELD];
    delete nextFields[ORDER_ID_REQUIREMENT_FIELD];
    delete nextFields[ORDER_ID_GENERATED_FIELD];
    delete nextFields[ORDER_ID_SIGNATURE_FIELD];

    const requirements = getRequirementsFromCustomFields(nextFields);
    const previousRequirements = getRequirementsFromCustomFields(previousFields);
    const effectiveRequirements = requirements.length ? requirements : previousRequirements;
    const settings = settingsOverride || readSettings();
    const rules = effectiveRequirements
        .map(requirement => getOrderIdRuleForRequirement(requirement, settings))
        .filter(Boolean);

    if (!rules.length) {
        return { customFields: nextFields, orderId: null, generated: false, changed: hadOrderIdFields };
    }

    const uniqueRules = [];
    const seenRuleKeys = new Set();
    rules.forEach(rule => {
        const key = `${normalizeComparable(rule.ruleRequirement)}:${rule.prefix}`;
        if (seenRuleKeys.has(key)) return;
        seenRuleKeys.add(key);
        uniqueRules.push(rule);
    });

    const signature = uniqueRules
        .map(rule => `${normalizeComparable(rule.ruleRequirement)}:${rule.prefix}:${rule.seed}`)
        .join('|');

    const existingOrderId = previousFields[ORDER_ID_FIELD] || existingControlNumber;
    const isSystemGenerated = previousFields[ORDER_ID_GENERATED_FIELD] === true &&
        previousFields[ORDER_ID_SIGNATURE_FIELD] === signature;
    if (isSystemGenerated && existingOrderId) {
        const existingIds = extractExistingGeneratedIds(existingOrderId, uniqueRules);
        const normalizedOrderId = existingIds
            ? formatOrderIdDisplay(uniqueRules, existingIds)
            : existingOrderId;
        const displayChanged = normalizedOrderId !== existingOrderId;

        nextFields[ORDER_ID_FIELD] = normalizedOrderId;
        nextFields[ORDER_ID_PREFIX_FIELD] = uniqueRules.map(rule => rule.prefix).join(',');
        nextFields[ORDER_ID_REQUIREMENT_FIELD] = uniqueRules.map(rule => rule.ruleRequirement || rule.requirement).join(',');
        nextFields[ORDER_ID_GENERATED_FIELD] = true;
        nextFields[ORDER_ID_SIGNATURE_FIELD] = signature;
        return { customFields: nextFields, orderId: normalizedOrderId, generated: true, changed: hadOrderIdFields || displayChanged };
    }

    const orderIds = [];
    for (const rule of uniqueRules) {
        orderIds.push(await nextOrderId(prisma, rule, settings));
    }
    const orderId = formatOrderIdDisplay(uniqueRules, orderIds);
    nextFields[ORDER_ID_FIELD] = orderId;
    nextFields[ORDER_ID_PREFIX_FIELD] = uniqueRules.map(rule => rule.prefix).join(',');
    nextFields[ORDER_ID_REQUIREMENT_FIELD] = uniqueRules.map(rule => rule.ruleRequirement || rule.requirement).join(',');
    nextFields[ORDER_ID_GENERATED_FIELD] = true;
    nextFields[ORDER_ID_SIGNATURE_FIELD] = signature;
    return { customFields: nextFields, orderId, generated: true, changed: true };
}
