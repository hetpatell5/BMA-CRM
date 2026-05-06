import express from 'express';
import prisma from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get availability status for team/all
router.get('/', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        let userWhereClause = { status: 'ACTIVE' };

        if (user.role === 'STAFF') {
            if (user.leaderId) {
                userWhereClause.leaderId = user.leaderId;
            } else {
                userWhereClause.id = user.id;
            }
        }
        // Admin/Manager see all active users

        // Fetch all active users with their availability (left join)
        const users = await prisma.user.findMany({
            where: userWhereClause,
            select: {
                id: true,
                fullName: true,
                role: true,
                avatar: true,
                availability: true,
            },
            orderBy: { fullName: 'asc' },
        });

        // Calculate online status based on lastSeen (within 5 mins)
        const now = new Date();
        const data = users.map(u => ({
            id: u.id, // Always use userId as the stable unique key (availability IDs can collide with user IDs)
            userId: u.id,
            status: u.availability?.status || 'AVAILABLE',
            statusNote: u.availability?.statusNote || null,
            lastSeen: u.availability?.lastSeen || null,
            user: { id: u.id, fullName: u.fullName, role: u.role, avatar: u.avatar },
            isOnline: u.availability?.lastSeen
                ? (now - new Date(u.availability.lastSeen)) < 5 * 60 * 1000
                : false,
        }));

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get my current status
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const availability = await prisma.userAvailability.findUnique({
            where: { userId: req.user.id }
        });

        const now = new Date();
        const isOnline = availability && (now - new Date(availability.lastSeen)) < 5 * 60 * 1000;

        res.json({
            success: true,
            data: availability ? { ...availability, isOnline } : { status: 'AVAILABLE', isOnline: false }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update my status
router.put('/status', authenticateToken, async (req, res) => {
    try {
        const { status, statusNote } = req.body;

        const availability = await prisma.userAvailability.upsert({
            where: { userId: req.user.id },
            update: {
                status,
                statusNote,
                lastSeen: new Date()
            },
            create: {
                userId: req.user.id,
                status,
                statusNote,
                lastSeen: new Date()
            }
        });

        // Log activity
        if (status) {
            await prisma.activityLog.create({
                data: {
                    userId: req.user.id,
                    action: 'status_change',
                    entityType: 'status',
                    entityId: status, // Store status as ID/Value
                    metadata: { note: statusNote }
                }
            });
        }

        const io = req.app.get('io');
        // Emit global status change event
        io.emit('status:changed', { userId: req.user.id, status, statusNote });

        res.json({ success: true, data: availability });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Heartbeat (keep-alive)
router.post('/heartbeat', authenticateToken, async (req, res) => {
    try {
        await prisma.userAvailability.upsert({
            where: { userId: req.user.id },
            update: { lastSeen: new Date() },
            create: { userId: req.user.id, lastSeen: new Date() }
        });
        res.json({ success: true });
    } catch (error) {
        // Silent fail for heartbeat
        res.status(200).json({ success: true });
    }
});

export default router;
