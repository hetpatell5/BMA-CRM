import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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
            // Guarantee we have latest staffRole and role from DB in case token is stale or missing it
            const dbUser = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: { role: true, staffRole: true, status: true }
            });

            if (!dbUser || dbUser.status !== 'ACTIVE') {
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
