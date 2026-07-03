import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

// In-memory user cache: avoid a DB round-trip on EVERY request.
// During large imports many concurrent requests are made; without this the
// prisma connection pool gets exhausted and auth fails with a 500.
const USER_CACHE = new Map(); // userId → { role, staffRole, status, cachedAt }
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

async function getCachedUser(userId) {
    const cached = USER_CACHE.get(userId);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        return cached;
    }
    const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, staffRole: true, status: true },
    });
    if (dbUser) {
        USER_CACHE.set(userId, { ...dbUser, cachedAt: Date.now() });
    }
    return dbUser;
}

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // For GET requests, also accept token as a query param so the browser can
    // open download URLs directly (avoids axios buffering the whole response).
    const token = (authHeader && authHeader.split(' ')[1])
        || (req.method === 'GET' ? req.query.token : null);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        try {
            const dbUser = await getCachedUser(decoded.id);

            if (!dbUser || dbUser.status !== 'ACTIVE') {
                USER_CACHE.delete(decoded.id); // evict bad cache entry
                return res.status(401).json({
                    success: false,
                    message: 'User account is inactive or deleted'
                });
            }

            req.user = {
                ...decoded,
                role: dbUser.role,
                staffRole: dbUser.staffRole
            };
            next();
        } catch (dbError) {
            console.error('Auth DB error:', dbError.message);
            // If DB is temporarily overloaded, fall back to JWT payload values
            // rather than rejecting with a 500 — import processing uses the same pool
            if (decoded && decoded.id) {
                req.user = { ...decoded };
                return next();
            }
            return res.status(500).json({
                success: false,
                message: 'Internal server error validating session'
            });
        }
    });
};

export const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }
        next();
    };
};
