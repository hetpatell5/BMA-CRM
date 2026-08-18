import express from 'express';
import prisma from '../config/database.js';

const router = express.Router();

// Helper to serialize BigInt
BigInt.prototype.toJSON = function () { return this.toString() }

// Helper: extract name and phone from a student record
// Checks standard fields first, then scans customFields for name-like/phone-like keys
function extractNameAndPhone(student) {
    // --- Name ---
    let name = student.fullName || '';
    if (!name && student.customFields) {
        const cf = student.customFields;
        const nameKeys = ['name', 'full name', 'student name', 'candidate name', 'fullname'];
        for (const [k, v] of Object.entries(cf)) {
            if (nameKeys.includes(k.trim().toLowerCase()) && v) { name = String(v).trim(); break; }
        }
    }
    if (!name) name = 'Unknown';

    // --- Phone ---
    let number = student.phone || student.alternatePhone || '';
    if (!number && student.customFields) {
        const cf = student.customFields;
        const phoneKeys = ['mobile', 'mobile number', 'mobile no', 'phone', 'phone number', 'contact', 'contact number', 'whatsapp'];
        for (const [k, v] of Object.entries(cf)) {
            if (phoneKeys.includes(k.trim().toLowerCase()) && v) { number = String(v).trim(); break; }
        }
    }
    if (!number) number = 'N/A';
    return { name, number };
}

// GET /api/follow-ups — List follow-ups with pagination and filters
// ADMIN/MANAGER: sees all users' follow-ups (can filter by ?userId=)
// Others: only their own follow-ups
router.get('/', async (req, res) => {
    try {
        const { search, status, page = 1, limit = 10, userId } = req.query;
        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(limit, 10);
        const skip = (pageNumber - 1) * pageSize;

        const isAdmin = req.user.role === 'ADMIN';

        // Admin sees all; optionally filter by a specific userId
        // Non-admin always scoped to their own records
        const where = isAdmin
            ? (userId ? { createdById: parseInt(userId, 10) } : {})
            : { createdById: req.user.id };

        if (status) {
            where.status = status;
        }

        // Optional search filter — search by name, number, description, or requirement
        if (search && search.trim()) {
            const s = search.trim();
            where.OR = [
                { name: { contains: s } },
                { number: { contains: s } },
                { description: { contains: s } },
                { requirement: { contains: s } },
            ];
        }

        const [followUps, total] = await Promise.all([
            prisma.dailyFollowUp.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
                include: {
                    createdBy: {
                        select: { id: true, fullName: true }
                    }
                }
            }),
            prisma.dailyFollowUp.count({ where })
        ]);

        res.json({ 
            success: true, 
            data: followUps,
            meta: {
                total,
                page: pageNumber,
                limit: pageSize,
                totalPages: Math.ceil(total / pageSize)
            }
        });
    } catch (error) {
        console.error('Error fetching follow-ups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/follow-ups/stats — Per-user follow-up summary (Admin/Manager only)
router.get('/stats', async (req, res) => {
    try {
        const isAdmin = req.user.role === 'ADMIN';
        if (!isAdmin) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        // Get all users who have any follow-ups
        const userStats = await prisma.dailyFollowUp.groupBy({
            by: ['createdById', 'status'],
            _count: { id: true },
        });

        // Get user details for each createdById
        const userIds = [...new Set(userStats.map(s => s.createdById))];
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, role: true, staffRole: true }
        });

        const userMap = Object.fromEntries(users.map(u => [u.id, u]));

        // Build per-user stats map
        const statsMap = {};
        for (const stat of userStats) {
            const uid = stat.createdById;
            if (!statsMap[uid]) {
                statsMap[uid] = {
                    user: userMap[uid] || { id: uid, fullName: 'Unknown' },
                    pending: 0,
                    completed: 0,
                };
            }
            if (stat.status === 'PENDING') statsMap[uid].pending = stat._count.id;
            else if (stat.status === 'COMPLETED') statsMap[uid].completed = stat._count.id;
        }

        const result = Object.values(statsMap).sort((a, b) =>
            (b.pending + b.completed) - (a.pending + a.completed)
        );

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Error fetching follow-up stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/follow-ups/team-today — Today's pending follow-ups per user (Admin/Manager only)
router.get('/team-today', async (req, res) => {
    try {
        const isAdmin = req.user.role === 'ADMIN';
        if (!isAdmin) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const followUps = await prisma.dailyFollowUp.findMany({
            where: {
                status: 'PENDING',
                followupDate: { lte: tomorrow }
            },
            orderBy: { followupDate: 'asc' },
            include: {
                createdBy: { select: { id: true, fullName: true } }
            }
        });

        res.json({ success: true, data: followUps });
    } catch (error) {
        console.error('Error fetching team today follow-ups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/follow-ups — Create a new follow-up
router.post('/', async (req, res) => {
    try {
        const { name, number, description, requirement, followupDate, color } = req.body;

        if (!name || !number || !description || !requirement || !followupDate) {
            return res.status(400).json({ success: false, error: 'All fields are required' });
        }

        const followUp = await prisma.dailyFollowUp.create({
            data: {
                name,
                number,
                description,
                requirement,
                followupDate: new Date(followupDate),
                color,
                createdById: req.user.id,
            },
            include: {
                createdBy: {
                    select: { id: true, fullName: true }
                }
            }
        });

        res.status(201).json({ success: true, data: followUp });
    } catch (error) {
        console.error('Error creating follow-up:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/follow-ups/:id — Update a follow-up (description, requirement, followupDate)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { description, requirement, followupDate, status, color } = req.body;

        const updateData = {};
        if (description !== undefined) updateData.description = description;
        if (requirement !== undefined) updateData.requirement = requirement;
        if (followupDate !== undefined) updateData.followupDate = new Date(followupDate);
        if (status !== undefined) updateData.status = status;
        if (color !== undefined) updateData.color = color;

        const followUp = await prisma.dailyFollowUp.update({
            where: { id: BigInt(id) },
            data: updateData,
            include: {
                createdBy: {
                    select: { id: true, fullName: true }
                }
            }
        });

        res.json({ success: true, data: followUp });
    } catch (error) {
        console.error('Error updating follow-up:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/follow-ups/:id — Complete / remove a follow-up
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.dailyFollowUp.delete({
            where: { id: BigInt(id) }
        });

        res.json({ success: true, message: 'Follow-up completed and removed' });
    } catch (error) {
        console.error('Error deleting follow-up:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/follow-ups/from-student/:studentId
// Creates a follow-up auto-filled from the student record, then marks the student as _inFollowUp
router.post('/from-student/:studentId', async (req, res) => {
    try {
        const { description, requirement, followupDate } = req.body;
        if (!description || !requirement || !followupDate) {
            return res.status(400).json({ success: false, error: 'description, requirement and followupDate are required' });
        }

        const studentId = BigInt(req.params.studentId);

        // Fetch the student to get name and phone
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { id: true, fullName: true, phone: true, alternatePhone: true, customFields: true },
        });
        if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

        const { name, number } = extractNameAndPhone(student);

        // Create the follow-up record
        const followUp = await prisma.dailyFollowUp.create({
            data: {
                name,
                number,
                description,
                requirement,
                followupDate: new Date(followupDate),
                createdById: req.user.id,
            },
            include: { createdBy: { select: { id: true, fullName: true } } }
        });

        // Mark the student row as in-follow-up via customFields._inFollowUp
        const existingCf = student.customFields && typeof student.customFields === 'object' ? { ...student.customFields } : {};
        existingCf._inFollowUp = true;
        existingCf._inFollowUpDate = new Date().toISOString();
        existingCf._followUpId = followUp.id.toString();
        await prisma.student.update({
            where: { id: studentId },
            data: { customFields: existingCf },
        });

        res.status(201).json({ success: true, data: followUp });
    } catch (error) {
        console.error('Error creating follow-up from student:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
