import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import prisma from '../config/database.js';
import {
    getPickupAddresses,
    createShipment,
    trackShipment,
} from '../services/shiprocketService.js';

const router = Router();

// All routes require ADMIN or MANAGER role
const requireAdminOrManager = requireRole('ADMIN', 'MANAGER');

// ─── GET /api/shiprocket/pickup-addresses ──────────────────────────────────────
// Returns pickup locations configured in your Shiprocket account
router.get('/pickup-addresses', requireAdminOrManager, async (req, res, next) => {
    try {
        const addresses = await getPickupAddresses();
        res.json({ success: true, data: addresses });
    } catch (error) {
        next(error);
    }
});

// ─── POST /api/shiprocket/create-shipment/:studentId ──────────────────────────
// Creates a Shiprocket order for a CRM order (student record).
// Saves AWB + Shiprocket IDs back into the order's customFields.
router.post('/create-shipment/:studentId', requireAdminOrManager, async (req, res, next) => {
    try {
        const { studentId } = req.params;
        const {
            pickupLocationName,
            weight,
            length,
            width,
            height,
            paymentMethod,
            declaredValue,
            // Optional overrides (in case auto-fill from CRM is insufficient)
            customerName: overrideName,
            customerPhone: overridePhone,
            shippingAddress: overrideAddress,
            shippingCity: overrideCity,
            shippingState: overrideState,
            shippingPincode: overridePincode,
        } = req.body;

        // Fetch the CRM order record
        const student = await prisma.student.findUnique({
            where: { id: BigInt(studentId) },
        });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const cf = (student.customFields && typeof student.customFields === 'object')
            ? student.customFields
            : {};

        // Helper to read from customFields by keyword
        function cfGet(...keywords) {
            const kws = keywords.map(k => k.toLowerCase());
            for (const [key, val] of Object.entries(cf)) {
                const lk = key.toLowerCase();
                if (kws.some(kw => lk.includes(kw) || kw === lk)) {
                    return String(val ?? '').trim();
                }
            }
            return '';
        }

        // Build the payload — prefer CRM data, allow manual overrides from request body
        const customerName = overrideName || student.fullName || cfGet('name', 'full name');
        const customerPhone = overridePhone || student.phone || cfGet('contact', 'phone', 'mobile');
        const shippingAddress = overrideAddress
            || cfGet('postal address', 'address')
            || [student.address, student.city, student.state].filter(Boolean).join(', ');
        const shippingCity = overrideCity || student.city || cfGet('city');
        const shippingState = overrideState || student.state || cfGet('state');
        const shippingPincode = overridePincode || student.pincode || cfGet('pincode', 'pin');

        // Validate required fields
        const missing = [];
        if (!customerName) missing.push('Customer Name');
        if (!customerPhone) missing.push('Customer Phone');
        if (!shippingAddress) missing.push('Shipping Address');
        if (!shippingCity) missing.push('City');
        if (!shippingState) missing.push('State');
        if (!shippingPincode) missing.push('Pincode');
        if (!pickupLocationName) missing.push('Pickup Location');
        if (!weight) missing.push('Weight');

        if (missing.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missing.join(', ')}`,
            });
        }

        // Create the shipment on Shiprocket
        const result = await createShipment({
            orderId: student.id.toString(),
            orderDate: new Date().toISOString().split('T')[0],
            customerName,
            customerPhone,
            shippingAddress,
            shippingCity,
            shippingState,
            shippingPincode,
            declaredValue: Number(declaredValue) || 0,
            paymentMethod: paymentMethod || 'Prepaid',
            weight: Number(weight),
            length: Number(length) || 25,
            width: Number(width) || 20,
            height: Number(height) || 5,
            pickupLocationName,
        });

        // Save Shiprocket data back to the CRM order's customFields
        const updatedFields = {
            ...cf,
            shiprocketOrderId: String(result.shiprocketOrderId),
            shiprocketShipmentId: String(result.shipmentId || ''),
            shiprocketAwb: result.awb || '',
            shiprocketStatus: result.status || 'CREATED',
            shiprocketCourier: result.courierName || '',
            shiprocketCreatedAt: new Date().toISOString(),
            shiprocketPaymentMethod: paymentMethod || 'Prepaid',
        };

        await prisma.student.update({
            where: { id: BigInt(studentId) },
            data: { customFields: updatedFields },
        });

        res.json({
            success: true,
            message: 'Shipment created successfully on Shiprocket',
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

// ─── GET /api/shiprocket/track/:studentId ─────────────────────────────────────
// Returns live tracking info for a CRM order that has been shipped
router.get('/track/:studentId', requireAdminOrManager, async (req, res, next) => {
    try {
        const { studentId } = req.params;

        const student = await prisma.student.findUnique({
            where: { id: BigInt(studentId) },
        });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const cf = student.customFields || {};
        const shiprocketOrderId = cf.shiprocketOrderId;

        if (!shiprocketOrderId) {
            return res.status(400).json({
                success: false,
                message: 'This order has not been shipped via Shiprocket yet',
            });
        }

        const tracking = await trackShipment(shiprocketOrderId);

        // Update status in customFields if it changed
        if (tracking.currentStatus && tracking.currentStatus !== cf.shiprocketStatus) {
            await prisma.student.update({
                where: { id: BigInt(studentId) },
                data: {
                    customFields: {
                        ...cf,
                        shiprocketStatus: tracking.currentStatus,
                        shiprocketAwb: tracking.awb || cf.shiprocketAwb,
                        shiprocketCourier: tracking.courierName || cf.shiprocketCourier,
                    },
                },
            });
        }

        res.json({ success: true, data: tracking });
    } catch (error) {
        next(error);
    }
});

export default router;
