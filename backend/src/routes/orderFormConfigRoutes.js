import express from 'express';
import prisma from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
const requireManagerConfig = requireRole('ADMIN', 'MANAGER');

// Default initial config to seed
const DEFAULT_CONFIG = {
  requirementOptions: [
    "Project (Synopsis + Report + Guide)",
    "Project (Synopsis)",
    "Project (Report)",
    "Project (Guide)",
    "Handwritten Assignment",
    "Handwritten Practical",
    "Guess Paper",
    "In-Depth Study Guide",
    "Quick Readable Notes"
  ],
  customFields: [
    {
      id: "cf_project_topic",
      label: "Project Topic",
      type: "text",
      placeholder: "Enter full topic title...",
      required: false,
      width: "full",
      showWhen: "requirement_is_project"
    },
    {
      id: "cf_delivery_type",
      label: "Delivery Type",
      type: "dropdown",
      options: ["Soft Copy", "Hard Copy"],
      required: true,
      width: "half",
      showWhen: "always"
    },
    {
      id: "cf_priority",
      label: "Priority",
      type: "dropdown",
      options: ["LOW", "NORMAL", "HIGH", "URGENT"],
      required: true,
      width: "half",
      showWhen: "always"
    },
    {
      id: "cf_synopsis_deadline",
      label: "Synopsis Deadline",
      type: "date",
      placeholder: "",
      required: false,
      width: "half",
      showWhen: "requirement_is_project"
    },
    {
      id: "cf_report_deadline",
      label: "Report Deadline",
      type: "date",
      placeholder: "",
      required: false,
      width: "half",
      showWhen: "requirement_is_project"
    },
    {
      id: "cf_expert_payment",
      label: "Expert Payment (₹)",
      type: "number",
      placeholder: "Amount to pay expert",
      required: false,
      width: "full",
      showWhen: "always"
    },
    {
      id: "cf_telecaller",
      label: "Telecaller / Lead Closer",
      type: "text",
      placeholder: "e.g. Priya Sharma",
      required: false,
      width: "full",
      showWhen: "always"
    },
    {
      id: "cf_special_instructions",
      label: "Special Instructions",
      type: "textarea",
      placeholder: "Any specific requirements...",
      required: false,
      width: "full",
      showWhen: "always"
    }
  ]
};

// GET /api/order-form-config -> Get current config (no auth, for all users)
router.get('/', async (req, res) => {
    try {
        let formConfig = await prisma.orderFormConfig.findFirst();

        if (!formConfig) {
            // Seed defaults
            formConfig = await prisma.orderFormConfig.create({
                data: {
                    config: DEFAULT_CONFIG
                }
            });
        }

        res.json({ success: true, data: formConfig.config });
    } catch (error) {
        console.error('Error fetching order form config:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch form configuration' });
    }
});

// PUT /api/order-form-config -> Update config (Admin/Manager only)
router.put('/', authenticateToken, requireManagerConfig, async (req, res) => {
    try {
        const { config } = req.body;

        if (!config || typeof config !== 'object') {
            return res.status(400).json({ success: false, message: 'Invalid config format' });
        }

        let formConfig = await prisma.orderFormConfig.findFirst();

        if (formConfig) {
            formConfig = await prisma.orderFormConfig.update({
                where: { id: formConfig.id },
                data: { config }
            });
        } else {
            formConfig = await prisma.orderFormConfig.create({
                data: { config }
            });
        }

        res.json({ success: true, message: 'Config updated successfully', data: formConfig.config });
    } catch (error) {
        console.error('Error updating order form config:', error);
        res.status(500).json({ success: false, message: 'Failed to update form configuration' });
    }
});

export default router;
