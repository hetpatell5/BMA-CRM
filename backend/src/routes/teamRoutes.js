import express from 'express';
import prisma from '../config/database.js';
import bcrypt from 'bcryptjs';
import { upload } from '../middleware/upload.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import { readSettings } from './appSettingsRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const STAFF_ASSIGNMENT_ROLES = ['GUIDE', 'EXPERT', 'BOTH', 'TELECALLER', 'WRITTER'];
const STUDENT_ASSIGNMENT_ROLES = ['GUIDE', 'EXPERT', 'BOTH'];
const DEGREE_REQUIRED_STAFF_ROLES = ['GUIDE', 'EXPERT', 'BOTH', 'WRITTER'];

// Serialize Prisma BigInt fields such as student IDs in payment breakdown data.
BigInt.prototype.toJSON = function () { return this.toString() };

const normalizeStaffRole = (staffRole) => {
    if (staffRole === undefined || staffRole === null || staffRole === '') {
        return null;
    }

    if (staffRole === 'WRITER') {
        return 'WRITTER';
    }

    return staffRole;
};

const isValidStaffRole = (staffRole) => (
    staffRole === null || STAFF_ASSIGNMENT_ROLES.includes(staffRole)
);

// ==========================================
// IMPORTANT: Static routes MUST come before /:id routes
// ==========================================

// Get staff members available for student assignment
router.get('/guides/available', async (req, res, next) => {
    try {
        // Use raw SQL to avoid Prisma client type issues with staffRole
        const guides = await prisma.$queryRaw`
            SELECT id, full_name as "fullName", email, degree, staff_role as "staffRole"
            FROM users
            WHERE role = 'STAFF'
              AND status = 'ACTIVE'
              AND staff_role IS NOT NULL
              AND staff_role != 'TELECALLER'
            ORDER BY full_name ASC
        `;

        res.json({ success: true, data: guides });
    } catch (error) {
        next(error);
    }
});

// Get available Managers/Leaders (for assigning team leaders)
router.get('/managers/available', async (req, res, next) => {
    try {
        const leaders = await prisma.user.findMany({
            where: {
                OR: [
                    { role: 'MANAGER' },
                    { role: 'ADMIN' },
                ],
                status: 'ACTIVE',
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
            },
            orderBy: { fullName: 'asc' },
        });

        res.json({
            success: true,
            data: leaders,
        });
    } catch (error) {
        next(error);
    }
});

// Get assignable users (all active users for task assignment)
router.get('/assignable', async (req, res, next) => {
    try {
        const users = await prisma.user.findMany({
            where: { status: 'ACTIVE' },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
            },
            orderBy: { fullName: 'asc' },
        });

        res.json({
            success: true,
            data: users,
        });
    } catch (error) {
        next(error);
    }
});

// Get users eligible to take over/co-handle orders (Admin/Manager only)
router.get('/takeover/available', async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
            });
        }

        const users = await prisma.user.findMany({
            where: {
                status: 'ACTIVE',
                OR: [
                    { role: 'ADMIN' },
                    { role: 'MANAGER' },
                    { role: 'STAFF', staffRole: 'TELECALLER' },
                ],
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                staffRole: true,
            },
            orderBy: [
                { role: 'asc' },
                { fullName: 'asc' },
            ],
        });

        res.json({ success: true, data: users });
    } catch (error) {
        next(error);
    }
});

// Get my team members (Manager/Leader view)
router.get('/leader/me/members', async (req, res, next) => {
    try {
        if (req.user.role !== 'MANAGER' && req.user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
            });
        }

        const whereClause = req.user.role === 'ADMIN'
            ? { id: { not: req.user.id }, status: 'ACTIVE' }
            : { role: 'STAFF', status: 'ACTIVE' };

        const members = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                status: true,
                avatar: true,
                lastLogin: true,
                degree: true,
                staffRole: true,
                availability: {
                    select: {
                        status: true,
                        statusNote: true,
                        lastSeen: true,
                    },
                },
            },
            orderBy: { fullName: 'asc' },
        });

        res.json({
            success: true,
            data: members,
        });
    } catch (error) {
        next(error);
    }
});

// Get all team members (Admin/Manager only)
router.get('/', async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
            });
        }

        let where = {};

        // Managers can see all staff members + themselves
        if (req.user.role === 'MANAGER') {
            where = {
                OR: [
                    { id: req.user.id },
                    { role: 'STAFF' },
                ],
            };
        }

        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                status: true,
                avatar: true,
                lastLogin: true,
                degree: true,
                staffRole: true,
                createdAt: true,
                leaderId: true,
                leader: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
                teamMembers: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        role: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            success: true,
            data: users,
        });
    } catch (error) {
        next(error);
    }
});

// Get staff payment summary (Admin/Manager only)
router.get('/payment-summary', async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
            });
        }

        const members = await prisma.user.findMany({
            where: {
                OR: [
                    { role: 'STAFF' },
                    {
                        role: { in: ['ADMIN', 'MANAGER'] },
                        OR: [
                            { staffRole: { not: null } },
                            { pricing: { some: {} } },
                            { paymentRecords: { some: {} } },
                            { assignedStudents: { some: {} } },
                        ],
                    },
                ],
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                status: true,
                avatar: true,
                staffRole: true,
                bankName: true,
                bankAccName: true,
                bankAccNo: true,
                ifscCode: true,
                bankBranch: true,
                upiId: true,
                qrScannerUrl: true,
                bankPassbookUrl: true,
                pricing: {
                    select: {
                        id: true,
                        label: true,
                        price: true,
                    },
                    orderBy: { id: 'asc' },
                },
                paymentRecords: {
                    select: {
                        id: true,
                        amount: true,
                        note: true,
                        paidAt: true,
                        invoiceUrl: true,
                        studentIds: true,
                        breakdown: true,
                    },
                    orderBy: { paidAt: 'desc' },
                },
                assignedStudents: {
                    select: {
                        id: true,
                        fullName: true,
                        status: true,
                        createdAt: true,
                        customFields: true,
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
            orderBy: { fullName: 'asc' },
        });

        res.json({
            success: true,
            data: members,
        });
    } catch (error) {
        next(error);
    }
});

// Get team member by ID
router.get('/:id', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);

        // Check permissions
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER' && req.user.id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                status: true,
                avatar: true,
                lastLogin: true,
                degree: true,
                staffRole: true,
                createdAt: true,
                updatedAt: true,
                leaderId: true,
                leader: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
                teamMembers: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        role: true,
                    },
                },
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.json({
            success: true,
            data: user,
        });
    } catch (error) {
        next(error);
    }
});

// Create new team member (Admin only)
router.post('/', async (req, res, next) => {
    try {
        // Only admins can create users
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can create users',
            });
        }

        const { email, password, fullName, role, degree, staffRole } = req.body;

        if (!email || !password || !fullName) {
            return res.status(400).json({
                success: false,
                message: 'Email, password, and full name are required',
            });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists',
            });
        }

        // Validate role — supported: ADMIN, MANAGER, STAFF
        if (role && !['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role. Must be ADMIN, MANAGER, or STAFF',
            });
        }

        const normalizedStaffRole = normalizeStaffRole(staffRole);

        if (!isValidStaffRole(normalizedStaffRole)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid staff role. Must be GUIDE, EXPERT, BOTH, TELECALLER, or WRITTER',
            });
        }

        const nextRole = role || 'STAFF';
        const shouldKeepDegree = nextRole === 'STAFF' && DEGREE_REQUIRED_STAFF_ROLES.includes(normalizedStaffRole);

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                passwordHash,
                fullName,
                role: nextRole,
                degree: shouldKeepDegree ? degree : null,
                staffRole: nextRole === 'STAFF' ? normalizedStaffRole : null,
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                status: true,
                degree: true,
                staffRole: true,
                createdAt: true,
                leaderId: true,
                leader: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
            },
        });

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: user,
        });
    } catch (error) {
        next(error);
    }
});

// Update team member (Admin only, or MANAGER for their team)
router.put('/:id', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        const { fullName, email, role, status, degree, staffRole, avatar } = req.body;
        const normalizedStaffRole = normalizeStaffRole(staffRole);
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                staffRole: true,
            },
        });

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        if (role && !['ADMIN', 'MANAGER', 'STAFF'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role. Must be ADMIN, MANAGER, or STAFF',
            });
        }

        if (staffRole !== undefined && !isValidStaffRole(normalizedStaffRole)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid staff role. Must be GUIDE, EXPERT, BOTH, TELECALLER, or WRITTER',
            });
        }

        // Check permissions
        if (req.user.role !== 'ADMIN') {
            if (req.user.role === 'MANAGER') {
                if (targetUser.role !== 'STAFF') {
                    return res.status(403).json({
                        success: false,
                        message: 'Managers can only update staff members',
                    });
                }

                if (role && role !== targetUser.role) {
                    return res.status(403).json({
                        success: false,
                        message: 'Managers cannot change user roles',
                    });
                }
            } else {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied',
                });
            }
        }

        const updateData = {};

        if (email !== undefined) {
            const normalizedEmail = email.toLowerCase();
            const existingUser = await prisma.user.findFirst({
                where: { 
                    email: normalizedEmail,
                    id: { not: userId }
                },
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use by another member',
                });
            }
            updateData.email = normalizedEmail;
        }
        const nextRole = role ?? targetUser.role;
        const effectiveStaffRole = staffRole !== undefined
            ? normalizedStaffRole
            : normalizeStaffRole(targetUser.staffRole);
        const shouldKeepDegree = nextRole === 'STAFF' && DEGREE_REQUIRED_STAFF_ROLES.includes(effectiveStaffRole);

        if (fullName !== undefined) updateData.fullName = fullName;
        if (role !== undefined) updateData.role = role;
        if (status !== undefined) updateData.status = status;
        if (avatar !== undefined) updateData.avatar = avatar;
        if (staffRole !== undefined) updateData.staffRole = nextRole === 'STAFF' ? normalizedStaffRole : null;

        if (degree !== undefined) {
            updateData.degree = shouldKeepDegree ? degree : null;
        } else if (!shouldKeepDegree && (staffRole !== undefined || role !== undefined)) {
            updateData.degree = null;
        }

        if (role !== undefined && role !== 'STAFF') {
            updateData.staffRole = null;
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                status: true,
                avatar: true,
                leaderId: true,
                leader: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                },
            },
        });

        res.json({
            success: true,
            message: 'User updated successfully',
            data: user,
        });
    } catch (error) {
        next(error);
    }
});

// Permanently delete team member (Admin only)
router.delete('/:id', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);

        // Only admins can delete users
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can delete users',
            });
        }

        // Cannot delete yourself
        if (userId === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account',
            });
        }

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Remove leader assignment from any team members who report to this user
        await prisma.user.updateMany({
            where: { leaderId: userId },
            data: { leaderId: null },
        });

        // Delete related records to avoid foreign key issues
        await prisma.userAvailability.deleteMany({
            where: { userId: userId },
        });

        await prisma.activityLog.deleteMany({
            where: { userId: userId },
        });

        // Delete the user permanently
        await prisma.user.delete({
            where: { id: userId },
        });

        res.json({
            success: true,
            message: 'User permanently deleted',
        });
    } catch (error) {
        next(error);
    }
});

// Get payment details (Admin only)
router.get('/:id/payment-details', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);

        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Only admins can view payment details' });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, fullName: true, bankName: true, bankAccName: true, bankAccNo: true, ifscCode: true, upiId: true, bankBranch: true, qrScannerUrl: true, bankPassbookUrl: true },
        });

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

// Reset password for a team member (Admin only)
router.put('/:id/reset-password', async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Only admins can reset passwords' });
        }
        const userId = parseInt(req.params.id);
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        const hashed = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashed } });
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        next(error);
    }
});

// Update payment details (Admin only)
router.put('/:id/payment-details', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        const { bankName, bankAccName, bankAccNo, ifscCode, upiId, bankBranch } = req.body;

        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Only admins can update payment details' });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { bankName, bankAccName, bankAccNo, ifscCode, upiId, bankBranch },
            select: { id: true, bankName: true, bankAccName: true, bankAccNo: true, ifscCode: true, upiId: true, bankBranch: true },
        });

        res.json({ success: true, message: 'Payment details updated', data: user });
    } catch (error) {
        next(error);
    }
});

// GET /team/:id/pricing
router.get('/:id/pricing', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        const pricing = await prisma.memberPricing.findMany({
            where: { userId },
            orderBy: { id: 'asc' },
        });
        res.json({ success: true, data: pricing });
    } catch (error) {
        next(error);
    }
});

// POST /team/:id/pricing
router.post('/:id/pricing', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Only admins can update pricing' });
        }
        
        const { pricing } = req.body;
        
        await prisma.$transaction([
            prisma.memberPricing.deleteMany({ where: { userId } }),
            prisma.memberPricing.createMany({
                data: pricing.map(p => ({
                    userId,
                    label: p.label,
                    price: parseFloat(p.price),
                })),
            }),
        ]);
        
        const newPricing = await prisma.memberPricing.findMany({
            where: { userId },
            orderBy: { id: 'asc' },
        });
        
        res.json({ success: true, data: newPricing });
    } catch (error) {
        next(error);
    }
});

// POST /team/:id/upload/qr-scanner
router.post('/:id/upload/qr-scanner', upload.single('file'), async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Only admins can upload' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const fileUrl = `/uploads/${req.file.filename}`;
        
        const user = await prisma.user.update({
            where: { id: userId },
            data: { qrScannerUrl: fileUrl },
            select: { qrScannerUrl: true },
        });
        
        res.json({ success: true, data: user, message: 'QR Scanner uploaded' });
    } catch (error) {
        next(error);
    }
});

// POST /team/:id/upload/bank-passbook
router.post('/:id/upload/bank-passbook', upload.single('file'), async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Only admins can upload' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const fileUrl = `/uploads/${req.file.filename}`;
        
        const user = await prisma.user.update({
            where: { id: userId },
            data: { bankPassbookUrl: fileUrl },
            select: { bankPassbookUrl: true },
        });
        
        res.json({ success: true, data: user, message: 'Bank Passbook uploaded' });
    } catch (error) {
        next(error);
    }
});

// POST /team/:id/payment
router.post('/:id/payment', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: 'Only admins can record payments' });
        }

        const { amount, note, studentIds, breakdown } = req.body;
        
        if (!amount || !studentIds || !breakdown) {
            return res.status(400).json({ success: false, message: 'Missing required payment data' });
        }

        // Fetch user data for invoice
        const member = await prisma.user.findUnique({
            where: { id: userId },
            select: { fullName: true, email: true, role: true, staffRole: true, bankAccName: true, bankAccNo: true, ifscCode: true, bankName: true }
        });

        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const now = new Date();
        const invoiceId = `INV-${Date.now()}`;
        
        // Ensure invoice directory exists
        const invoiceDir = path.join(__dirname, '../../uploads/invoices');
        if (!fs.existsSync(invoiceDir)) {
            fs.mkdirSync(invoiceDir, { recursive: true });
        }

        // Generate Invoice HTML from Settings Template
        const settings = readSettings();
        const templateString = settings.emailConfig?.invoiceTemplate || `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Invoice {invoiceId}</title>
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
        </html>`;

        const breakdownRows = breakdown.map(b => `
                    <tr>
                        <td>${b.studentName}</td>
                        <td>${b.requirement}</td>
                        <td>Rs ${Number(b.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    </tr>`).join('');

        const totalAmountStr = Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const noteSectionStr = note ? `<div style="margin-top: 30px;"><strong>Note:</strong> ${note}</div>` : '';

        let htmlContent = templateString
            .replace(/{invoiceId}/g, invoiceId)
            .replace(/{date}/g, now.toLocaleDateString())
            .replace(/{memberName}/g, member.fullName)
            .replace(/{memberRole}/g, member.staffRole || member.role)
            .replace(/{memberEmail}/g, member.email)
            .replace(/{memberAccount}/g, `${member.bankAccNo || 'N/A'} (${member.bankName || 'N/A'})`)
            .replace(/{breakdownTableRows}/g, breakdownRows)
            .replace(/{totalAmount}/g, totalAmountStr)
            .replace(/{noteSection}/g, noteSectionStr);

        const fileName = `invoice-${userId}-${Date.now()}.pdf`;
        const filePath = path.join(invoiceDir, fileName);
        let invoiceUrl = `/uploads/invoices/${fileName}`;
        
        // Find local browser executable
        const executablePaths = [
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ];
        const foundPath = executablePaths.find(fs.existsSync);
        
        let browser;
        try {
            browser = await puppeteer.launch({ 
                executablePath: foundPath,
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            
            // Adjust margins and sizes for A4
            const pdfBuffer = await page.pdf({ 
                format: 'A4', 
                printBackground: true,
                margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
            });
            fs.writeFileSync(filePath, pdfBuffer);
        } catch (error) {
            console.error('Error generating PDF:', error);
            // Fallback to HTML if browser fails
            const htmlFileName = `invoice-${userId}-${Date.now()}.html`;
            fs.writeFileSync(path.join(invoiceDir, htmlFileName), htmlContent);
            invoiceUrl = `/uploads/invoices/${htmlFileName}`;
            // Intentionally not returning here, so we proceed to Prisma insert.
        } finally {
            if (browser) await browser.close();
        }

        const payment = await prisma.paymentRecord.create({
            data: {
                userId,
                amount: parseFloat(amount),
                note,
                invoiceUrl,
                createdById: req.user.id,
                studentIds: studentIds, // JSON
                breakdown: breakdown,   // JSON
                paidAt: now
            }
        });

        res.json({ success: true, data: payment, message: 'Payment recorded and invoice generated' });
    } catch (error) {
        next(error);
    }
});

// POST /team/:id/send-email
router.post('/:id/send-email', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        const { subject, body, invoiceUrl } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, fullName: true }
        });

        if (!user || !user.email) {
            return res.status(404).json({ success: false, message: 'User or email not found' });
        }

        const settings = readSettings();
        const emailConfig = settings.emailConfig;

        if (!emailConfig || !emailConfig.user || !emailConfig.pass) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email SMTP is not configured in settings.' 
            });
        }

        const absoluteUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`;
        const fullInvoiceUrl = invoiceUrl ? `${absoluteUrl}${invoiceUrl}` : '';

        let finalSubject = subject || 'Payment Notification';
        finalSubject = finalSubject.replace(/{memberName}/g, user.fullName);

        let finalBody = emailConfig.bodyTemplate || body || `<p>Hello ${user.fullName},</p><p>A payment has been processed for you.</p>`;
        finalBody = finalBody.replace(/{memberName}/g, user.fullName).replace(/{invoiceUrl}/g, fullInvoiceUrl);

        const transporter = nodemailer.createTransport({
            service: 'gmail', // or use host/port for generic SMTP
            auth: {
                user: emailConfig.user,
                pass: emailConfig.pass,
            },
        });

        const mailOptions = {
            from: `"${emailConfig.fromName || 'CRM Admin'}" <${emailConfig.user}>`,
            to: user.email,
            subject: finalSubject,
            html: finalBody,
        };

        // Attach invoice if provided
        if (invoiceUrl) {
            const absolutePath = path.join(__dirname, '../../', invoiceUrl);
            if (fs.existsSync(absolutePath)) {
                mailOptions.attachments = [
                    {
                        filename: path.basename(invoiceUrl),
                        path: absolutePath,
                    }
                ];
            }
        }

        await transporter.sendMail(mailOptions);

        res.json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send email. Check your SMTP credentials.' 
        });
    }
});

// GET /team/:id/dashboard
router.get('/:id/dashboard', async (req, res, next) => {
    try {
        const userId = parseInt(req.params.id);
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER' && req.user.id !== userId) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                pricing: true,
                paymentRecords: {
                    orderBy: { paidAt: 'desc' },
                },
                assignedStudents: {
                    select: {
                        id: true,
                        fullName: true,
                        createdAt: true,
                        status: true,
                        customFields: true,
                    },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

export default router;
