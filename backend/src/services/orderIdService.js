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
    const partial = exact || rules.find(rule => {
        const normalizedRule = normalizeComparable(rule.requirement);
        return normalizedRule &&
            (normalizedRequirement.includes(normalizedRule) || normalizedRule.includes(normalizedRequirement));
    });

    const parsedSeed = parseOrderIdSeed(partial?.prefix);
    if (!partial || !parsedSeed) return null;

    return {
        requirement: requirementText,
        ruleRequirement: partial.requirement,
        ...parsedSeed,
    };
}

function parseSequence(orderId, prefix) {
    const match = String(orderId || '').trim().match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i'));
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
        const generatedOrderId = cf[ORDER_ID_GENERATED_FIELD] === true ? cf[ORDER_ID_FIELD] : '';
        return Math.max(
            max,
            parseMaxSequenceFromText(student.controlNumber, prefix),
            parseMaxSequenceFromText(generatedOrderId, prefix),
        );
    }, 0);
}

async function nextOrderId(prisma, rule, settings) {
    const counters = settings.orderIdCounters && typeof settings.orderIdCounters === 'object'
        ? { ...settings.orderIdCounters }
        : {};
    const currentCounter = Number(counters[rule.prefix]);
    const currentMax = Math.max(
        Number.isFinite(currentCounter) ? currentCounter : 0,
        rule.start - 1,
        Number.isFinite(currentCounter) ? 0 : await findMaxExistingSequence(prisma, rule.prefix),
    );
    const next = currentMax + 1;

    counters[rule.prefix] = next;
    settings.orderIdCounters = counters;
    writeSettings({ ...settings, orderIdCounters: counters });

    return `${rule.prefix}${String(next).padStart(rule.width, '0')}`;
}

export async function ensureOrderIdForCustomFields(prisma, customFields, existingCustomFields = null, existingControlNumber = null) {
    const nextFields = customFields && typeof customFields === 'object' && !Array.isArray(customFields)
        ? { ...customFields }
        : {};
    const previousFields = existingCustomFields && typeof existingCustomFields === 'object' && !Array.isArray(existingCustomFields)
        ? existingCustomFields
        : {};

    delete nextFields[ORDER_ID_FIELD];
    delete nextFields[ORDER_ID_PREFIX_FIELD];
    delete nextFields[ORDER_ID_REQUIREMENT_FIELD];
    delete nextFields[ORDER_ID_GENERATED_FIELD];
    delete nextFields[ORDER_ID_SIGNATURE_FIELD];

    const requirements = getRequirementsFromCustomFields(nextFields);
    const previousRequirements = getRequirementsFromCustomFields(previousFields);
    const effectiveRequirements = requirements.length ? requirements : previousRequirements;
    const settings = readSettings();
    const rules = effectiveRequirements
        .map(requirement => getOrderIdRuleForRequirement(requirement, settings))
        .filter(Boolean);

    if (!rules.length) return { customFields: nextFields, orderId: existingControlNumber || null };

    const uniqueRules = [];
    const seenRuleKeys = new Set();
    rules.forEach(rule => {
        const key = `${normalizeComparable(rule.ruleRequirement)}:${rule.prefix}`;
        if (seenRuleKeys.has(key)) return;
        seenRuleKeys.add(key);
        uniqueRules.push(rule);
    });

    const signature = uniqueRules
        .map(rule => `${normalizeComparable(rule.requirement)}:${rule.prefix}:${rule.seed}`)
        .join('|');

    const existingOrderId = previousFields[ORDER_ID_FIELD] || existingControlNumber;
    const isSystemGenerated = previousFields[ORDER_ID_GENERATED_FIELD] === true &&
        previousFields[ORDER_ID_SIGNATURE_FIELD] === signature;
    if (isSystemGenerated && existingOrderId) {
        nextFields[ORDER_ID_FIELD] = existingOrderId;
        nextFields[ORDER_ID_PREFIX_FIELD] = uniqueRules.map(rule => rule.prefix).join(',');
        nextFields[ORDER_ID_REQUIREMENT_FIELD] = uniqueRules.map(rule => rule.requirement).join(',');
        nextFields[ORDER_ID_GENERATED_FIELD] = true;
        nextFields[ORDER_ID_SIGNATURE_FIELD] = signature;
        return { customFields: nextFields, orderId: existingOrderId };
    }

    const orderIds = [];
    for (const rule of uniqueRules) {
        orderIds.push(await nextOrderId(prisma, rule, settings));
    }
    const orderId = orderIds.join(', ');
    nextFields[ORDER_ID_FIELD] = orderId;
    nextFields[ORDER_ID_PREFIX_FIELD] = uniqueRules.map(rule => rule.prefix).join(',');
    nextFields[ORDER_ID_REQUIREMENT_FIELD] = uniqueRules.map(rule => rule.requirement).join(',');
    nextFields[ORDER_ID_GENERATED_FIELD] = true;
    nextFields[ORDER_ID_SIGNATURE_FIELD] = signature;
    return { customFields: nextFields, orderId };
}
