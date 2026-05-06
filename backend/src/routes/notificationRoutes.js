import express from 'express';
import prisma from '../config/database.js';

const router = express.Router();

// GET /api/notifications — paginated list for logged-in user
router.get('/', async (req, res, next) => {
    try {
        const { page = 1, limit = 20, unreadOnly } = req.query;
        const pageNum = parseInt(page);
        const limitNum = Math.min(parseInt(limit), 50);
        const skip = (pageNum - 1) * limitNum;

        const where = {
            userId: req.user.id,
            ...(unreadOnly === 'true' ? { isRead: false } : {}),
        };

        const [total, notifications] = await Promise.all([
            prisma.notification.count({ where }),
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
            }),
        ]);

        res.json({
            success: true,
            data: {
                notifications: notifications.map((n) => ({
                    ...n,
                    id: n.id.toString(),
                })),
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res, next) => {
    try {
        const count = await prisma.notification.count({
            where: { userId: req.user.id, isRead: false },
        });
        res.json({ success: true, data: { count } });
    } catch (err) {
        next(err);
    }
});

// PUT /api/notifications/mark-read — body: { ids: string[] }
router.put('/mark-read', async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'ids array required' });
        }
        await prisma.notification.updateMany({
            where: {
                id: { in: ids.map(BigInt) },
                userId: req.user.id,
            },
            data: { isRead: true },
        });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// PUT /api/notifications/mark-all-read
router.put('/mark-all-read', async (req, res, next) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user.id, isRead: false },
            data: { isRead: true },
        });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res, next) => {
    try {
        await prisma.notification.delete({
            where: {
                id: BigInt(req.params.id),
                userId: req.user.id,
            },
        });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

export default router;
