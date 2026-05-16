import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { invalidateTokenCache } from '../services/shiprocketService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SETTINGS_FILE = path.join(__dirname, '../../app-settings.json');

const router = Router();
const requireAdmin = requireRole('ADMIN');

const DEFAULT_SETTINGS = {
    shiprocket: {
        email: process.env.SHIPROCKET_EMAIL || '',
        password: '',   // stored encrypted via env, editable here for convenience
        pickupLocation: 'Office',
        defaultWeight: '0.5',
        defaultLength: '25',
        defaultWidth: '20',
        defaultHeight: '5',
        defaultPaymentMethod: 'Prepaid',
        hardCopyKeywords: ['hard copy', 'hard-copy', 'hardcopy', 'printed copy'],
    },
    emailConfig: {
        user: '',
        pass: '',
        fromName: 'CRM Admin',
        bodyTemplate: `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Inter', sans-serif; color: #333; line-height: 1.6; background-color: #f9fafb; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; border: 1px solid #e5e7eb; }
  .btn { display: inline-block; padding: 10px 20px; background-color: #2563eb; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 500; }
  .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }
</style>
</head>
<body>
  <div class="container">
    <p>Hello <strong>{memberName}</strong>,</p>
    <p>We are pleased to inform you that your payment has been processed successfully. Please find your latest payment invoice attached to this email.</p>
    <p style="margin: 25px 0;">
      <a href="{invoiceUrl}" class="btn">View Invoice Online</a>
    </p>
    <div class="footer">
      <p>Regards,<br><strong>Admin Team</strong></p>
    </div>
  </div>
</body>
</html>`,
        invoiceTemplate: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
        h1 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .details { margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f8f9fa; color: #555; }
        .total { font-weight: bold; font-size: 1.2em; text-align: right; margin-top: 20px; }
        .footer { margin-top: 50px; text-align: center; color: #777; font-size: 0.9em; border-top: 1px solid #eee; padding-top: 20px; }
        .stamp { position: fixed; top: 100px; right: 50px; color: rgba(39, 174, 96, 0.4); font-size: 60px; border: 5px solid rgba(39, 174, 96, 0.4); padding: 10px 20px; transform: rotate(15deg); font-weight: bold; z-index: -1; }
    </style>
</head>
<body>
    <div class="stamp">PAID</div>
    <div class="header">
        <div>
            <h1>Payment Invoice</h1>
            <div class="details">
                <strong>Invoice Number:</strong> {invoiceId}<br>
                <strong>Date:</strong> {date}<br>
            </div>
        </div>
    </div>
    
    <div class="details">
        <h3>Billed To:</h3>
        <strong>Name:</strong> {memberName}<br>
        <strong>Role:</strong> {memberRole}<br>
        <strong>Email:</strong> {memberEmail}<br>
        <strong>Account:</strong> {memberAccount}
    </div>

    <table>
        <thead>
            <tr>
                <th>Order / Student</th>
                <th>Requirement</th>
                <th>Amount</th>
            </tr>
        </thead>
        <tbody>
            {breakdownTableRows}
        </tbody>
    </table>

    <div class="total">
        Total Paid Amount: Rs {totalAmount}
    </div>
    
    {noteSection}

    <div class="footer">
        This is a computer-generated invoice and does not require a physical signature.
    </div>
</body>
</html>`,
    },
    orderPdfConfig: {
        template: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{documentTitle}</title>
    <style>
        @page {
            size: A4;
            margin: 10mm;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #0f172a;
            background: #ffffff;
            font-size: 11px;
            line-height: 1.35;
        }
        .sheet {
            width: 100%;
            border: 1px solid #cbd5e1;
        }
        .header {
            padding: 12px 14px 8px;
            border-bottom: 2px solid #1e3a8a;
            background: #f8fafc;
        }
        .brand {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            color: #1e3a8a;
            margin-bottom: 4px;
        }
        .title {
            margin: 0;
            font-size: 20px;
            line-height: 1.15;
            font-weight: 700;
            color: #0f172a;
        }
        .meta {
            margin-top: 4px;
            color: #475569;
            font-size: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        th, td {
            border: 1px solid #dbe3ef;
            padding: 6px 8px;
            vertical-align: top;
            word-break: break-word;
        }
        th {
            background: #eff6ff;
            color: #1e3a8a;
            text-align: left;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        td.label {
            width: 29%;
            background: #f8fafc;
            color: #334155;
            font-weight: 600;
        }
        td.value {
            width: 71%;
            color: #0f172a;
            white-space: pre-wrap;
        }
        tr.section-row td {
            background: #dbeafe;
            color: #1e3a8a;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-size: 10px;
            padding-top: 7px;
            padding-bottom: 7px;
        }
        .footer-note {
            padding: 8px 12px;
            border-top: 1px solid #dbe3ef;
            font-size: 10px;
            color: #64748b;
            background: #f8fafc;
        }
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="sheet">
        <div class="header">
            <div class="brand">{brandName}</div>
            <h1 class="title">{fullName}</h1>
            <div class="meta">
                Order ID: {orderId} | Program: {programName} | Status: {status} | Source: {source} | Created: {createdAt} | Updated: {updatedAt}
            </div>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Field</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                {allDetailsTable}
            </tbody>
        </table>
        <div class="footer-note">
            Contact: {email} | {phone}
        </div>
    </div>
</body>
</html>`,
    },
};

function readSettings() {
    try {
        if (existsSync(SETTINGS_FILE)) {
            const raw = readFileSync(SETTINGS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            return {
                ...DEFAULT_SETTINGS,
                ...parsed,
                shiprocket: { ...DEFAULT_SETTINGS.shiprocket, ...(parsed.shiprocket || {}) },
                emailConfig: { ...DEFAULT_SETTINGS.emailConfig, ...(parsed.emailConfig || {}) },
                orderPdfConfig: { ...DEFAULT_SETTINGS.orderPdfConfig, ...(parsed.orderPdfConfig || {}) },
            };
        }
    } catch {}
    return DEFAULT_SETTINGS;
}

function writeSettings(settings) {
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

// GET /api/app-settings — returns current settings (password masked)
router.get('/', requireAdmin, (req, res) => {
    try {
        const settings = readSettings();
        // Mask the password in the response
        const safe = {
            ...settings,
            shiprocket: {
                ...settings.shiprocket,
                password: settings.shiprocket?.password ? '••••••••' : '',
                passwordSet: !!settings.shiprocket?.password,
            },
            emailConfig: {
                ...settings.emailConfig,
                pass: settings.emailConfig?.pass ? '••••••••' : '',
                passSet: !!settings.emailConfig?.pass,
            },
        };
        res.json({ success: true, data: safe });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to load settings' });
    }
});

// PUT /api/app-settings — updates settings
router.put('/', requireAdmin, (req, res) => {
    try {
        const { shiprocket } = req.body;
        const current = readSettings();

        if (shiprocket) {
            const updatedShiprocket = { ...current.shiprocket };

            // Update each field if provided (skip password if it's the masked placeholder)
            if (shiprocket.email !== undefined) updatedShiprocket.email = shiprocket.email;
            if (shiprocket.password && shiprocket.password !== '••••••••') {
                updatedShiprocket.password = shiprocket.password;
            }
            if (shiprocket.pickupLocation !== undefined) updatedShiprocket.pickupLocation = shiprocket.pickupLocation;
            if (shiprocket.defaultWeight !== undefined) updatedShiprocket.defaultWeight = shiprocket.defaultWeight;
            if (shiprocket.defaultLength !== undefined) updatedShiprocket.defaultLength = shiprocket.defaultLength;
            if (shiprocket.defaultWidth !== undefined) updatedShiprocket.defaultWidth = shiprocket.defaultWidth;
            if (shiprocket.defaultHeight !== undefined) updatedShiprocket.defaultHeight = shiprocket.defaultHeight;
            if (shiprocket.defaultPaymentMethod !== undefined) updatedShiprocket.defaultPaymentMethod = shiprocket.defaultPaymentMethod;
            if (shiprocket.hardCopyKeywords !== undefined) updatedShiprocket.hardCopyKeywords = shiprocket.hardCopyKeywords;

            current.shiprocket = updatedShiprocket;
        }

        if (req.body.emailConfig) {
            const { emailConfig } = req.body;
            const updatedEmail = { ...current.emailConfig };

            if (emailConfig.user !== undefined) updatedEmail.user = emailConfig.user;
            if (emailConfig.pass && emailConfig.pass !== '••••••••') {
                updatedEmail.pass = emailConfig.pass;
            }
            if (emailConfig.fromName !== undefined) updatedEmail.fromName = emailConfig.fromName;
            if (emailConfig.bodyTemplate !== undefined) updatedEmail.bodyTemplate = emailConfig.bodyTemplate;
            if (emailConfig.invoiceTemplate !== undefined) updatedEmail.invoiceTemplate = emailConfig.invoiceTemplate;

            current.emailConfig = updatedEmail;
        }

        if (req.body.orderPdfConfig) {
            const { orderPdfConfig } = req.body;
            const updatedOrderPdf = { ...current.orderPdfConfig };

            if (orderPdfConfig.template !== undefined) updatedOrderPdf.template = orderPdfConfig.template;

            current.orderPdfConfig = updatedOrderPdf;
        }

        writeSettings(current);

        // Update env vars in memory immediately
        if (shiprocket?.email) process.env.SHIPROCKET_EMAIL = shiprocket.email;
        if (shiprocket?.password && shiprocket.password !== '••••••••') {
            process.env.SHIPROCKET_PASSWORD = shiprocket.password;
            // Credentials changed — force re-auth on next Shiprocket call
            invalidateTokenCache();
        }

        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to save settings' });
    }
});

// GET /api/app-settings/order-pdf-config — safe PDF template config for frontend use
router.get('/order-pdf-config', (req, res) => {
    try {
        const settings = readSettings();
        res.json({
            success: true,
            data: {
                template: settings.orderPdfConfig?.template || DEFAULT_SETTINGS.orderPdfConfig.template,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to load order PDF config' });
    }
});

// GET /api/app-settings/shiprocket-config — public config for frontend (no sensitive data)
// Used by the Shiprocket modal to get defaults
router.get('/shiprocket-config', (req, res) => {
    try {
        const settings = readSettings();
        const sr = settings.shiprocket || {};
        res.json({
            success: true,
            data: {
                pickupLocation: sr.pickupLocation || 'Office',
                defaultWeight: sr.defaultWeight || '0.5',
                defaultLength: sr.defaultLength || '25',
                defaultWidth: sr.defaultWidth || '20',
                defaultHeight: sr.defaultHeight || '5',
                defaultPaymentMethod: sr.defaultPaymentMethod || 'Prepaid',
                hardCopyKeywords: sr.hardCopyKeywords || ['hard copy'],
                isConfigured: !!(sr.email && (sr.password || process.env.SHIPROCKET_PASSWORD)),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to load config' });
    }
});

export { readSettings };
export default router;
