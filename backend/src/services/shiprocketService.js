/**
 * Shiprocket Service
 * Handles authentication (with token caching) and API calls to Shiprocket.
 * Credentials are read from app-settings.json (set via Settings page) with
 * fallback to environment variables. Token is cached for 9 days.
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../../app-settings.json');

const SHIPROCKET_BASE = 'https://apiv2.shiprocket.in/v1/external';

let cachedToken = null;
let tokenExpiry = null;

/** Read the Shiprocket config from settings file, falling back to .env */
function getConfig() {
    try {
        if (existsSync(SETTINGS_FILE)) {
            const raw = readFileSync(SETTINGS_FILE, 'utf8');
            const settings = JSON.parse(raw);
            const sr = settings?.shiprocket || {};
            return {
                email: sr.email || process.env.SHIPROCKET_EMAIL || '',
                password: sr.password || process.env.SHIPROCKET_PASSWORD || '',
                pickupLocation: sr.pickupLocation || 'Office',
                defaultWeight: sr.defaultWeight || '0.5',
                defaultLength: sr.defaultLength || '25',
                defaultWidth: sr.defaultWidth || '20',
                defaultHeight: sr.defaultHeight || '5',
                defaultPaymentMethod: sr.defaultPaymentMethod || 'Prepaid',
                hardCopyKeywords: sr.hardCopyKeywords || ['hard copy'],
            };
        }
    } catch {}
    return {
        email: process.env.SHIPROCKET_EMAIL || '',
        password: process.env.SHIPROCKET_PASSWORD || '',
        pickupLocation: 'Office',
        defaultWeight: '0.5',
        defaultLength: '25',
        defaultWidth: '20',
        defaultHeight: '5',
        defaultPaymentMethod: 'Prepaid',
        hardCopyKeywords: ['hard copy'],
    };
}

/**
 * Authenticate and return a valid Bearer token.
 * Caches token for 9 days (Shiprocket tokens last 10 days).
 * If credentials change, invalidate the cache by resetting.
 */
export function invalidateTokenCache() {
    cachedToken = null;
    tokenExpiry = null;
}

async function getToken() {
    const now = Date.now();
    if (cachedToken && tokenExpiry && now < tokenExpiry) {
        return cachedToken;
    }

    const { email, password } = getConfig();

    if (!email || !password) {
        throw new Error('Shiprocket credentials not configured. Please go to Settings → Shiprocket and enter your email and password.');
    }

    const res = await fetch(`${SHIPROCKET_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Shiprocket auth failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    if (!data.token) {
        throw new Error('Shiprocket returned an invalid auth response. Please check your credentials in Settings.');
    }

    cachedToken = data.token;
    tokenExpiry = now + (9 * 24 * 60 * 60 * 1000); // 9 days
    return cachedToken;
}

/** Authenticated fetch against Shiprocket API */
async function srFetch(path, options = {}) {
    const token = await getToken();
    const res = await fetch(`${SHIPROCKET_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    const data = await res.json();
    if (!res.ok) {
        const msg = data?.message || data?.error || JSON.stringify(data);
        throw new Error(`Shiprocket API error (${res.status}): ${msg}`);
    }
    return data;
}

/** Get list of configured pickup addresses from your Shiprocket account. */
export async function getPickupAddresses() {
    const data = await srFetch('/settings/company/pickup');
    return data?.data?.shipping_address || [];
}

/**
 * Create a shipment order on Shiprocket.
 */
export async function createShipment(payload) {
    const config = getConfig();
    const {
        orderId,
        orderDate,
        customerName,
        customerPhone,
        shippingAddress,
        shippingCity,
        shippingState,
        shippingPincode,
        shippingCountry = 'India',
        declaredValue,
        paymentMethod,
        weight,
        length,
        width,
        height,
        pickupLocationName,
        itemName = 'Assignment Papers',
    } = payload;

    const body = {
        order_id: String(orderId),
        order_date: orderDate || new Date().toISOString().split('T')[0],
        pickup_location: pickupLocationName || config.pickupLocation,
        billing_customer_name: customerName,
        billing_last_name: '',
        billing_address: shippingAddress,
        billing_city: shippingCity,
        billing_pincode: String(shippingPincode),
        billing_state: shippingState,
        billing_country: shippingCountry,
        billing_email: '',
        billing_phone: String(customerPhone),
        shipping_is_billing: true,
        order_items: [{
            name: itemName,
            sku: `CRM-${orderId}`,
            units: 1,
            selling_price: declaredValue || 0,
            discount: '',
            tax: '',
            hsn: '',
        }],
        payment_method: paymentMethod === 'COD' ? 'COD' : 'Prepaid',
        sub_total: declaredValue || 0,
        length,
        breadth: width,
        height,
        weight,
    };

    const data = await srFetch('/orders/create/adhoc', {
        method: 'POST',
        body: JSON.stringify(body),
    });

    return {
        shiprocketOrderId: data.order_id,
        shipmentId: data.shipment_id,
        awb: data.awb_code || null,
        status: data.status || 'CREATED',
        courierName: data.courier_name || null,
    };
}

/** Track a shipment using the Shiprocket Order ID. */
export async function trackShipment(shiprocketOrderId) {
    const data = await srFetch(`/courier/track?order_id=${shiprocketOrderId}`);
    const tracking = data?.tracking_data;
    return {
        currentStatus: tracking?.shipment_status || 'Unknown',
        awb: tracking?.awb_code || null,
        courierName: tracking?.courier_name || null,
        trackingUrl: tracking?.track_url || (tracking?.awb_code ? `https://shiprocket.co/tracking/${tracking.awb_code}` : null),
        etd: tracking?.etd || null,
        scans: tracking?.shipment_track_activities || [],
    };
}
