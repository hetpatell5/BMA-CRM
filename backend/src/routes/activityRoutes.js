import express from 'express';
import prisma from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Helper to serialize BigInt
BigInt.prototype.toJSON = function () { return this.toString() }

// Get live activity feed
router.get('/live', authenticateToken, async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        const logs = await prisma.activityLog.findMany({
            take: parseInt(limit),
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { id: true, fullName: true, avatar: true, role: true }
                }
            }
        });

        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user specific activity
router.get('/user/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const logs = await prisma.activityLog.findMany({
            where: { userId: parseInt(id) },
            take: 20,
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { fullName: true } }
            }
        });
        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
