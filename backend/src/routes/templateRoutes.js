import express from 'express';
import prisma from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ensureOrderIdForCustomFields } from '../services/orderIdService.js';
import { readSettings } from './appSettingsRoutes.js';
const router = express.Router();
const requireTemplateManager = requireRole('ADMIN', 'MANAGER');
const requireTemplateViewer  = requireRole('ADMIN', 'MANAGER', 'STAFF');

// Helper to serialize BigInt
BigInt.prototype.toJSON = function () { return this.toString() }

// ─── PUBLIC ROUTES (no auth) ───────────────────────────
// Fetch a form template by ID for public rendering
router.get('/public/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const template = await prisma.taskTemplate.findUnique({
            where: { id: parseInt(id) },
            select: { id: true, name: true, description: true, fields: true, isActive: true }
        });
        if (!template || !template.isActive) {
            return res.status(404).json({ success: false, message: 'Form not found or inactive' });
        }
        res.json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching form', error: error.message });
    }
});

// Submit a public form → creates a Student record AND a Lead record in CRM
router.post('/public/:id/submit', async (req, res) => {
    try {
        const { id } = req.params;
        const { responses, telecallerId } = req.body; // telecallerId = the staff member who shared the form

        const template = await prisma.taskTemplate.findUnique({
            where: { id: parseInt(id) },
        });
        if (!template || !template.isActive) {
            return res.status(404).json({ success: false, message: 'Form not found or inactive' });
        }

        // Map responses to known fields by matching common label patterns
        const lower = (s) => (s || '').toLowerCase().trim();
        const findVal = (keywords) => {
            for (const [label, val] of Object.entries(responses || {})) {
                if (keywords.some(kw => lower(label).includes(kw))) return val || null;
            }
            return null;
        };

        const fullName  = findVal(['name', 'full name', 'student name']) || 'Unknown';
        const email     = findVal(['email']);
        const phone     = findVal(['phone', 'mobile', 'contact']);
        const programme = findVal(['programme', 'program', 'course', 'degree']);
        const city      = findVal(['city']);
        const state     = findVal(['state']);
        
        // Ensure "Requirement of" is mapped so Order ID generation works
        const requirement = findVal(['requirement', 'service', 'product', 'type', 'category']);
        if (requirement && !responses['Requirement of']) {
            responses['Requirement of'] = requirement;
        }

        // Validate telecallerId if provided
        const tcId = telecallerId ? parseInt(telecallerId) : null;

        // 1. Create Student record
        let orderIdResult = { customFields: responses || {}, orderId: null };
        try {
            const settings = readSettings();
            console.log('[form-submit] rules:', JSON.stringify(settings.orderIdRules));
            console.log('[form-submit] responses keys:', Object.keys(responses || {}));
            console.log('[form-submit] responses:', JSON.stringify(responses));
            orderIdResult = await ensureOrderIdForCustomFields(prisma, responses || {}, null, null, settings);
            console.log('[form-submit] orderId generated:', orderIdResult.orderId);
        } catch (orderIdErr) {
            console.error('[form-submit] Order ID generation failed:', orderIdErr.message);
        }

        const student = await prisma.student.create({
            data: {
                fullName,
                email:     email     || null,
                phone:     phone     || null,
                programme: programme || null,
                city:      city      || null,
                state:     state     || null,
                source:    'form_submission',
                status:    'NEW_LEAD',
                customFields: orderIdResult.customFields,
                controlNumber: orderIdResult.orderId || null,
                // Track which telecaller's form this came from
                ...(tcId && { createdById: tcId, assignedById: tcId }),
            }
        });

        // 2. Also create a Lead so it shows on the Leads page
        try {
            await prisma.lead.create({
                data: {
                    fullName,
                    email:            email     || null,
                    phone:            phone     || 'Not Provided',
                    interestedCourse: programme || null,
                    source:           'WEBSITE',
                    stage:            'NEW',
                    priority:         'MEDIUM',
                    followUpNotes:    `Form: "${template.name}" | Responses: ${JSON.stringify(responses)}`,
                    ...(tcId && { createdById: tcId, assignedToId: tcId }),
                }
            });
        } catch (leadErr) {
            // Non-fatal: student record was saved; log and continue
            console.error('[form-submit] Could not create lead:', leadErr.message);
        }

        res.status(201).json({
            success: true,
            message: 'Form submitted successfully! Your enquiry has been received.',
            data: { id: student.id.toString() }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error submitting form', error: error.message });
    }
});

// ─── PROTECTED ROUTES (auth required) ──────────────────
// Get all templates
router.get('/', authenticateToken, requireTemplateViewer, async (req, res) => {
    try {
        const templates = await prisma.taskTemplate.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching templates', error: error.message });
    }
});

// Get single template by ID
router.get('/:id', authenticateToken, requireTemplateViewer, async (req, res) => {
    try {
        const template = await prisma.taskTemplate.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
        res.json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching template', error: error.message });
    }
});

// Create new template (Admin/Manager)
router.post('/', authenticateToken, requireTemplateManager, async (req, res) => {
    try {
        const { name, description, fields, isActive } = req.body;

        if (!name || !fields || !Array.isArray(fields)) {
            return res.status(400).json({ success: false, message: 'Name and Fields array are required' });
        }

        const template = await prisma.taskTemplate.create({
            data: {
                name,
                description,
                fields,
                isActive: isActive ?? true,
                createdById: req.user.id
            }
        });

        res.status(201).json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating template', error: error.message });
    }
});

// Update template
router.put('/:id', authenticateToken, requireTemplateManager, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, fields, isActive } = req.body;

        const template = await prisma.taskTemplate.update({
            where: { id: parseInt(id) },
            data: { name, description, fields, isActive }
        });

        res.json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating template', error: error.message });
    }
});

// Delete template
router.delete('/:id', authenticateToken, requireTemplateManager, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.taskTemplate.delete({ where: { id: parseInt(id) } });
        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        try {
            await prisma.taskTemplate.update({
                where: { id: parseInt(req.params.id) },
                data: { isActive: false }
            });
            res.json({ success: true, message: 'Template deactivated (has linked tasks)' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error deleting template', error: error.message });
        }
    }
});

export default router;
