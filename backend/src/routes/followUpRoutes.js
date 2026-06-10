import express from 'express';
import prisma from '../config/database.js';

const router = express.Router();

// Helper to serialize BigInt
BigInt.prototype.toJSON = function () { return this.toString() }

// GET /api/follow-ups — List all follow-ups (with optional search)
router.get('/', async (req, res) => {
    try {
        const { search } = req.query;

        const where = { createdById: req.user.id };

        // Optional search filter — search by name, number, or description
        if (search && search.trim()) {
            const s = search.trim();
            where.OR = [
                { name: { contains: s } },
                { number: { contains: s } },
                { description: { contains: s } },
                { requirement: { contains: s } },
            ];
        }

        const followUps = await prisma.dailyFollowUp.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: {
                    select: { id: true, fullName: true }
                }
            }
        });

        res.json({ success: true, data: followUps });
    } catch (error) {
        console.error('Error fetching follow-ups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/follow-ups — Create a new follow-up
router.post('/', async (req, res) => {
    try {
        const { name, number, description, requirement, followupDate } = req.body;

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
        const { description, requirement, followupDate } = req.body;

        const updateData = {};
        if (description !== undefined) updateData.description = description;
        if (requirement !== undefined) updateData.requirement = requirement;
        if (followupDate !== undefined) updateData.followupDate = new Date(followupDate);

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

export default router;
