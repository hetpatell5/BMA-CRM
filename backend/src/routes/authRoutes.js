import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Login
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required',
            });
        }

        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: 'Account is inactive',
            });
        }

        // Update last login
        await prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() },
        });

        // Create or update UserAvailability to show user as online
        await prisma.userAvailability.upsert({
            where: { userId: user.id },
            update: {
                lastSeen: new Date(),
                statusNote: 'Just logged in'
            },
            create: {
                userId: user.id,
                lastSeen: new Date(),
                statusNote: 'Just logged in'
            }
        });

        // Generate token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                staffRole: user.staffRole,
                fullName: user.fullName,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    staffRole: user.staffRole,
                    degree: user.degree,
                    avatar: user.avatar,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

// Logout - Mark user as offline
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // Update UserAvailability to mark user as offline
        // Set lastSeen to 10 minutes ago to immediately show as offline
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        await prisma.userAvailability.upsert({
            where: { userId: req.user.id },
            update: {
                lastSeen: tenMinutesAgo,
                statusNote: 'Logged out'
            },
            create: {
                userId: req.user.id,
                lastSeen: tenMinutesAgo,
                statusNote: 'Logged out'
            }
        });

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error logging out', error: error.message });
    }
});

// Register (Admin only)
router.post('/register', authenticateToken, async (req, res, next) => {
    try {
        // Only admins can create new users
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can create new users',
            });
        }

        const { email, password, fullName, role } = req.body;

        if (!email || !password || !fullName) {
            return res.status(400).json({
                success: false,
                message: 'Email, password, and full name are required',
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters',
            });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists',
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                passwordHash,
                fullName,
                role: role || 'STAFF',
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                createdAt: true,
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

// Get current user
router.get('/me', authenticateToken, async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                staffRole: true,
                degree: true,
                status: true,
                avatar: true,
                lastLogin: true,
                createdAt: true,
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

// Change password
router.put('/change-password', authenticateToken, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required',
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);

        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect',
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters',
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: req.user.id },
            data: { passwordHash },
        });

        res.json({
            success: true,
            message: 'Password changed successfully',
        });
    } catch (error) {
        next(error);
    }
});
// Update current user profile
router.put('/me', authenticateToken, async (req, res, next) => {
    try {
        const { phone, degree } = req.body;
        // In the current schema, we don't have 'phone' or 'designation' on the User model directly,
        // but we can map 'designation' to 'degree' or 'staffRole' if we want.
        // Wait, the User model does not have 'phone'. Let's check Prisma schema.
        // I won't update phone in DB right now, unless we do a migration. 
        // We'll update degree as designation for now, and fullName if provided.
        const { fullName } = req.body;
        const updateData = {};
        if (fullName) updateData.fullName = fullName;
        if (degree !== undefined) updateData.degree = degree;

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData,
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                staffRole: true,
                degree: true,
                status: true,
                avatar: true,
            },
        });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user,
        });
    } catch (error) {
        next(error);
    }
});

// Change avatar (accepts base64 or URL)
router.put('/me/avatar', authenticateToken, async (req, res, next) => {
    try {
        const { avatar } = req.body;
        
        if (avatar === undefined) {
            return res.status(400).json({ success: false, message: 'Avatar data is required' });
        }

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { avatar },
            select: { id: true, avatar: true },
        });

        res.json({
            success: true,
            message: 'Avatar updated successfully',
            data: user,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
