import prisma from '../config/database.js';

/**
 * Central notification service.
 * Inserts notifications into the DB and pushes them via Socket.IO.
 *
 * @param {object} io - Socket.IO server instance
 * @param {object} payload
 * @param {number[]} payload.userIds - Target user IDs
 * @param {string}   payload.type    - Notification type key
 * @param {string}   payload.title   - Short heading
 * @param {string}   payload.message - Full description
 * @param {string}   [payload.link]  - Optional deep-link (e.g. "/leads/5")
 */
export async function notify(io, { userIds, type, title, message, link = null }) {
    if (!userIds || userIds.length === 0) return;

    // Deduplicate
    const unique = [...new Set(userIds.map(Number).filter(Boolean))];

    try {
        // Batch-insert into DB
        await prisma.notification.createMany({
            data: unique.map((userId) => ({
                userId,
                type,
                title,
                message,
                link,
            })),
        });

        // Fetch the freshly-inserted rows so we can push them with real IDs
        const saved = await prisma.notification.findMany({
            where: {
                userId: { in: unique },
                type,
                title,
                createdAt: { gte: new Date(Date.now() - 5000) }, // last 5 s
            },
            orderBy: { createdAt: 'desc' },
        });

        // Push to each user's private Socket.IO room
        if (io) {
            const byUser = {};
            saved.forEach((n) => {
                if (!byUser[n.userId]) byUser[n.userId] = [];
                byUser[n.userId].push({
                    ...n,
                    id: n.id.toString(),
                });
            });

            Object.entries(byUser).forEach(([userId, notifications]) => {
                notifications.forEach((n) => {
                    io.to(`user-${userId}`).emit('new-notification', n);
                });
            });
        }
    } catch (err) {
        // Non-fatal — log but don't crash the parent request
        console.error('notificationService error:', err.message);
    }
}

/**
 * Helper: get all admin + manager user IDs (for broadcasting to admins)
 */
export async function getAdminIds() {
    const users = await prisma.user.findMany({
        where: {
            role: { in: ['ADMIN', 'MANAGER'] },
            status: 'ACTIVE',
        },
        select: { id: true },
    });
    return users.map((u) => u.id);
}
