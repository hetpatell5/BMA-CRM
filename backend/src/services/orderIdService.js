import { readSettings, writeSettings } from '../routes/appSettingsRoutes.js';

export const ORDER_ID_FIELD = 'Order ID';
const ORDER_ID_PREFIX_FIELD = '_orderIdPrefix';
const ORDER_ID_REQUIREMENT_FIELD = '_orderIdRequirement';
const ORDER_ID_GENERATED_FIELD = '_orderIdGenerated';

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

function firstRequirementToken(requirement) {
    return String(requirement || '')
        .split(/[,/|]/)
        .map(part => part.trim())
        .filter(Boolean)[0] || '';
}

function fallbackPrefixForRequirement(requirement) {
    const words = String(requirement || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    if (!words.length) return '';
    if (words.length === 1) return words[0].slice(0, 2);
    return words.slice(0, 2).map(word => word[0]).join('');
}

export function normalizeOrderIdPrefix(prefix) {
    const normalized = String(prefix || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (normalized.replace(/\d+$/g, '') || normalized).slice(0, 8);
}

export function getRequirementFromCustomFields(customFields) {
    return firstRequirementToken(customFieldText(customFields, ...REQUIREMENT_KEYS));
}

export function getOrderIdPrefixForRequirement(requirement, settings = readSettings()) {
    const requirementText = String(requirement || '').trim();
    if (!requirementText) return '';

    const normalizedRequirement = normalizeComparable(requirementText);
    const rules = Array.isArray(settings.orderIdRules) ? settings.orderIdRules : [];

    const exact = rules.find(rule => normalizeComparable(rule.requirement) === normalizedRequirement);
    const partial = exact || rules.find(rule => {
        const normalizedRule = normalizeComparable(rule.requirement);
        return normalizedRule &&
            (normalizedRequirement.includes(normalizedRule) || normalizedRule.includes(normalizedRequirement));
    });

    const prefix = partial?.prefix || fallbackPrefixForRequirement(requirementText);
    return normalizeOrderIdPrefix(prefix);
}

function parseSequence(orderId, prefix) {
    const match = String(orderId || '').trim().match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i'));
    return match ? Number(match[1]) : 0;
}

async function findMaxExistingSequence(prisma, prefix) {
    if (!prefix) return 0;

    const candidates = await prisma.student.findMany({
        where: {
            controlNumber: { startsWith: prefix },
        },
        select: { controlNumber: true },
        take: 10000,
        orderBy: { createdAt: 'desc' },
    });

    return candidates.reduce((max, student) => {
        return Math.max(
            max,
            parseSequence(student.controlNumber, prefix),
        );
    }, 0);
}

async function nextOrderId(prisma, prefix, settings) {
    const counters = settings.orderIdCounters && typeof settings.orderIdCounters === 'object'
        ? { ...settings.orderIdCounters }
        : {};
    const currentCounter = Number(counters[prefix]);
    const currentMax = Number.isFinite(currentCounter)
        ? currentCounter
        : await findMaxExistingSequence(prisma, prefix);
    const next = currentMax + 1;

    counters[prefix] = next;
    writeSettings({ ...settings, orderIdCounters: counters });

    return `${prefix}${String(next).padStart(3, '0')}`;
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

    const requirement = getRequirementFromCustomFields(nextFields) || getRequirementFromCustomFields(previousFields);
    const settings = readSettings();
    const prefix = getOrderIdPrefixForRequirement(requirement, settings);

    if (!prefix) return { customFields: nextFields, orderId: existingControlNumber || null };

    const existingOrderId = previousFields[ORDER_ID_FIELD] || existingControlNumber;
    const isSystemGenerated = previousFields[ORDER_ID_GENERATED_FIELD] === true &&
        previousFields[ORDER_ID_PREFIX_FIELD] === prefix &&
        previousFields[ORDER_ID_REQUIREMENT_FIELD] === requirement;
    if (isSystemGenerated && parseSequence(existingOrderId, prefix) > 0) {
        nextFields[ORDER_ID_FIELD] = existingOrderId;
        nextFields[ORDER_ID_PREFIX_FIELD] = prefix;
        nextFields[ORDER_ID_REQUIREMENT_FIELD] = requirement;
        nextFields[ORDER_ID_GENERATED_FIELD] = true;
        return { customFields: nextFields, orderId: existingOrderId };
    }

    const orderId = await nextOrderId(prisma, prefix, settings);
    nextFields[ORDER_ID_FIELD] = orderId;
    nextFields[ORDER_ID_PREFIX_FIELD] = prefix;
    nextFields[ORDER_ID_REQUIREMENT_FIELD] = requirement;
    nextFields[ORDER_ID_GENERATED_FIELD] = true;
    return { customFields: nextFields, orderId };
}
