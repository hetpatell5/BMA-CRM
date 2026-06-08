import express from 'express';
import prisma from '../config/database.js';
import { notify, getAdminIds } from '../services/notificationService.js';

const router = express.Router();

// Get all leads with pagination and filtering
router.get('/', async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 50,
            search = '',
            stage,
            priority,
            source,
            assignedTo,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = Math.min(parseInt(limit), 100);
        const skip = (pageNum - 1) * limitNum;

        const where = {};

        // Search
        if (search) {
            where.OR = [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
            ];
        }

        // Filters
        if (stage) where.stage = stage;
        if (priority) where.priority = priority;
        if (source) where.source = source;
        if (assignedTo) where.assignedToId = parseInt(assignedTo);

        const total = await prisma.lead.count({ where });

        const leads = await prisma.lead.findMany({
            where,
            skip,
            take: limitNum,
            orderBy: { [sortBy]: sortOrder },
            include: {
                assignedTo: {
                    select: { id: true, fullName: true, avatar: true },
                },
                createdBy: {
                    select: { id: true, fullName: true, staffRole: true },
                },
                _count: {
                    select: { activities: true },
                },
            },
        });

        // Serialize BigInt
        const serializedLeads = leads.map(lead => ({
            ...lead,
            id: lead.id.toString(),
        }));

        res.json({
            success: true,
            data: {
                leads: serializedLeads,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get leads by stage (for Kanban view)
router.get('/pipeline', async (req, res, next) => {
    try {
        const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

        const pipeline = await Promise.all(
            stages.map(async (stage) => {
                const leads = await prisma.lead.findMany({
                    where: { stage },
                    take: 50, // Limit per column
                    orderBy: [
                        { priority: 'desc' },
                        { nextFollowUp: 'asc' },
                    ],
                    include: {
                        assignedTo: {
                            select: { id: true, fullName: true, avatar: true },
                        },
                    },
                });

                const count = await prisma.lead.count({ where: { stage } });

                return {
                    stage,
                    count,
                    leads: leads.map(lead => ({
                        ...lead,
                        id: lead.id.toString(),
                    })),
                };
            })
        );

        res.json({
            success: true,
            data: pipeline,
        });
    } catch (error) {
        next(error);
    }
});

// Get lead by ID
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const lead = await prisma.lead.findUnique({
            where: { id: BigInt(id) },
            include: {
                assignedTo: {
                    select: { id: true, fullName: true, email: true, avatar: true },
                },
                createdBy: {
                    select: { id: true, fullName: true },
                },
                activities: {
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                    include: {
                        createdBy: {
                            select: { id: true, fullName: true },
                        },
                    },
                },
                convertedStudents: {
                    select: { id: true, fullName: true, enrollmentNo: true },
                },
            },
        });

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found',
            });
        }

        const serializedLead = {
            ...lead,
            id: lead.id.toString(),
            activities: lead.activities.map(a => ({
                ...a,
                id: a.id.toString(),
                leadId: a.leadId.toString(),
            })),
            convertedStudents: lead.convertedStudents.map(s => ({
                ...s,
                id: s.id.toString(),
            })),
        };

        res.json({
            success: true,
            data: serializedLead,
        });
    } catch (error) {
        next(error);
    }
});

// Create lead
router.post('/', async (req, res, next) => {
    try {
        const {
            fullName,
            email,
            phone,
            alternatePhone,
            interestedCourse,
            source,
            sourceDetails,
            priority,
            assignedToId,
            nextFollowUp,
            followUpNotes,
            customFields,
        } = req.body;

        if (!fullName || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Full name and phone are required',
            });
        }

        const lead = await prisma.lead.create({
            data: {
                fullName,
                email,
                phone,
                alternatePhone,
                interestedCourse,
                source: source || 'MANUAL',
                sourceDetails,
                priority: priority || 'MEDIUM',
                assignedToId: assignedToId ? parseInt(assignedToId) : null,
                nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null,
                followUpNotes,
                createdById: req.user.id,
                customFields,
            },
            include: {
                assignedTo: {
                    select: { id: true, fullName: true },
                },
            },
        });

        // Create activity
        await prisma.leadActivity.create({
            data: {
                leadId: lead.id,
                activityType: 'NOTE',
                description: 'Lead created',
                createdById: req.user.id,
            },
        });

        // Notify admins of new lead
        const io = req.app.get('io');
        const adminIds = await getAdminIds();
        const notifyIds = adminIds.filter(id => id !== req.user.id);
        await notify(io, {
            userIds: notifyIds,
            type: 'NEW_LEAD',
            title: 'New Lead Added',
            message: `${lead.fullName} (${lead.phone}) was added as a new lead.`,
            link: `/leads/${lead.id}`,
        });

        // If assigned to someone, notify them too
        if (lead.assignedToId && lead.assignedToId !== req.user.id) {
            await notify(io, {
                userIds: [lead.assignedToId],
                type: 'LEAD_ASSIGNED',
                title: 'Lead Assigned to You',
                message: `You have been assigned the lead: ${lead.fullName}.`,
                link: `/leads/${lead.id}`,
            });
        }

        res.status(201).json({
            success: true,
            message: 'Lead created successfully',
            data: {
                ...lead,
                id: lead.id.toString(),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Update lead
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        // Get current lead for stage change tracking
        const currentLead = await prisma.lead.findUnique({
            where: { id: BigInt(id) },
        });

        if (!currentLead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found',
            });
        }

        // Convert dates
        if (updateData.nextFollowUp) {
            updateData.nextFollowUp = new Date(updateData.nextFollowUp);
        }
        if (updateData.assignedToId) {
            updateData.assignedToId = parseInt(updateData.assignedToId);
        }

        // Track stage change
        const stageChanged = updateData.stage && updateData.stage !== currentLead.stage;

        // Handle conversion
        if (updateData.stage === 'WON' && !currentLead.convertedAt) {
            updateData.convertedAt = new Date();
        }

        // Remove fields that shouldn't be updated
        delete updateData.id;
        delete updateData.createdAt;
        delete updateData.createdById;

        const lead = await prisma.lead.update({
            where: { id: BigInt(id) },
            data: updateData,
        });

        // Create stage change activity
        if (stageChanged) {
            await prisma.leadActivity.create({
                data: {
                    leadId: lead.id,
                    activityType: 'STAGE_CHANGE',
                    description: `Stage changed from ${currentLead.stage} to ${updateData.stage}`,
                    previousStage: currentLead.stage,
                    newStage: updateData.stage,
                    createdById: req.user.id,
                },
            });
        }

        // Notify when a lead is freshly assigned
        const io = req.app.get('io');
        const newAssignee = updateData.assignedToId;
        if (newAssignee && newAssignee !== currentLead.assignedToId && newAssignee !== req.user.id) {
            await notify(io, {
                userIds: [newAssignee],
                type: 'LEAD_ASSIGNED',
                title: 'Lead Assigned to You',
                message: `You have been assigned the lead: ${currentLead.fullName}.`,
                link: `/leads/${id}`,
            });
        }

        res.json({
            success: true,
            message: 'Lead updated successfully',
            data: {
                ...lead,
                id: lead.id.toString(),
            },
        });
            ...lead,
            id: lead.id.toString(),
            activities: lead.activities.map(a => ({
                ...a,
                id: a.id.toString(),
                leadId: a.leadId.toString(),
            })),
            convertedStudents: lead.convertedStudents.map(s => ({
                ...s,
                id: s.id.toString(),
            })),
        };

        res.json({
            success: true,
            data: serializedLead,
        });
    } catch (error) {
        next(error);
    }
});

// Create lead
router.post('/', async (req, res, next) => {
    try {
        const {
            fullName,
            email,
            phone,
            alternatePhone,
            interestedCourse,
            source,
            sourceDetails,
            priority,
            assignedToId,
            nextFollowUp,
            followUpNotes,
            customFields,
        } = req.body;

        if (!fullName || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Full name and phone are required',
            });
        }

        const lead = await prisma.lead.create({
            data: {
                fullName,
                email,
                phone,
                alternatePhone,
                interestedCourse,
                source: source || 'MANUAL',
                sourceDetails,
                priority: priority || 'MEDIUM',
                assignedToId: assignedToId ? parseInt(assignedToId) : null,
                nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null,
                followUpNotes,
                createdById: req.user.id,
                customFields,
            },
            include: {
                assignedTo: {
                    select: { id: true, fullName: true },
                },
            },
        });

        // Create activity
        await prisma.leadActivity.create({
            data: {
                leadId: lead.id,
                activityType: 'NOTE',
                description: 'Lead created',
                createdById: req.user.id,
            },
        });

        // Notify admins of new lead
        const io = req.app.get('io');
        const adminIds = await getAdminIds();
        const notifyIds = adminIds.filter(id => id !== req.user.id);
        await notify(io, {
            userIds: notifyIds,
            type: 'NEW_LEAD',
            title: 'New Lead Added',
            message: `${lead.fullName} (${lead.phone}) was added as a new lead.`,
            link: `/leads/${lead.id}`,
        });

        // If assigned to someone, notify them too
        if (lead.assignedToId && lead.assignedToId !== req.user.id) {
            await notify(io, {
                userIds: [lead.assignedToId],
                type: 'LEAD_ASSIGNED',
                title: 'Lead Assigned to You',
                message: `You have been assigned the lead: ${lead.fullName}.`,
                link: `/leads/${lead.id}`,
            });
        }

        res.status(201).json({
            success: true,
            message: 'Lead created successfully',
            data: {
                ...lead,
                id: lead.id.toString(),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Update lead
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        // Get current lead for stage change tracking
        const currentLead = await prisma.lead.findUnique({
            where: { id: BigInt(id) },
        });

        if (!currentLead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found',
            });
        }

        // Convert dates
        if (updateData.nextFollowUp) {
            updateData.nextFollowUp = new Date(updateData.nextFollowUp);
        }
        if (updateData.assignedToId) {
            updateData.assignedToId = parseInt(updateData.assignedToId);
        }

        // Track stage change
        const stageChanged = updateData.stage && updateData.stage !== currentLead.stage;

        // Handle conversion
        if (updateData.stage === 'WON' && !currentLead.convertedAt) {
            updateData.convertedAt = new Date();
        }

        // Remove fields that shouldn't be updated
        delete updateData.id;
        delete updateData.createdAt;
        delete updateData.createdById;

        const lead = await prisma.lead.update({
            where: { id: BigInt(id) },
            data: updateData,
        });

        // Create stage change activity
        if (stageChanged) {
            await prisma.leadActivity.create({
                data: {
                    leadId: lead.id,
                    activityType: 'STAGE_CHANGE',
                    description: `Stage changed from ${currentLead.stage} to ${updateData.stage}`,
                    previousStage: currentLead.stage,
                    newStage: updateData.stage,
                    createdById: req.user.id,
                },
            });
        }

        // Notify when a lead is freshly assigned
        const io = req.app.get('io');
        const newAssignee = updateData.assignedToId;
        if (newAssignee && newAssignee !== currentLead.assignedToId && newAssignee !== req.user.id) {
            await notify(io, {
                userIds: [newAssignee],
                type: 'LEAD_ASSIGNED',
                title: 'Lead Assigned to You',
                message: `You have been assigned the lead: ${currentLead.fullName}.`,
                link: `/leads/${id}`,
            });
        }

        res.json({
            success: true,
            message: 'Lead updated successfully',
            data: {
                ...lead,
                id: lead.id.toString(),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Delete lead
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        await prisma.lead.delete({
            where: { id: BigInt(id) },
        });

        res.json({
            success: true,
            message: 'Lead deleted successfully',
        });
    } catch (error) {
        next(error);
    }
});

// Bulk delete leads
router.post('/bulk-delete', async (req, res, next) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No lead IDs provided for deletion',
            });
        }

        const bigIntIds = ids.map(id => BigInt(id));

        await prisma.lead.deleteMany({
            where: { id: { in: bigIntIds } },
        });

        res.json({
            success: true,
            message: `${ids.length} leads deleted successfully`,
        });
    } catch (error) {
        next(error);
    }
});

// Add activity to lead
router.post('/:id/activities', async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            activityType,
            type,
            description,
            notes,
            outcome,
            nextFollowUp,
        } = req.body;

        const normalizedActivityType = activityType || (type === 'FOLLOWUP' ? 'FOLLOW_UP' : type);
        const normalizedDescription = description ?? notes;

        if (!normalizedActivityType || !normalizedDescription?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Activity type and notes are required',
            });
        }

        const activity = await prisma.leadActivity.create({
            data: {
                leadId: BigInt(id),
                activityType: normalizedActivityType,
                description: normalizedDescription.trim(),
                outcome,
                createdById: req.user.id,
            },
            include: {
                createdBy: {
                    select: { id: true, fullName: true },
                },
            },
        });

        // Update last contact date
        await prisma.lead.update({
            where: { id: BigInt(id) },
            data: {
                lastContactDate: new Date(),
                ...(nextFollowUp ? { nextFollowUp: new Date(nextFollowUp) } : {}),
            },
        });

        res.status(201).json({
            success: true,
            message: 'Activity added successfully',
            data: {
                ...activity,
                id: activity.id.toString(),
                leadId: activity.leadId.toString(),
                type: activity.activityType,
                notes: activity.description,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Convert lead to student
router.post('/:id/convert', async (req, res, next) => {
    try {
        const { id } = req.params;
        const studentData = req.body;

        const lead = await prisma.lead.findUnique({
            where: { id: BigInt(id) },
        });

        if (!lead) {
            return res.status(404).json({
                success: false,
                message: 'Lead not found',
            });
        }

        if (lead.stage === 'WON') {
            return res.status(400).json({
                success: false,
                message: 'Lead is already converted',
            });
        }

        // Create student from lead
        const student = await prisma.student.create({
            data: {
                fullName: studentData.fullName || lead.fullName,
                email: studentData.email || lead.email,
                phone: studentData.phone || lead.phone,
                alternatePhone: studentData.alternatePhone || lead.alternatePhone,
                course: studentData.course || lead.interestedCourse,
                batchYear: studentData.batchYear ? parseInt(studentData.batchYear) : null,
                enrollmentNo: studentData.enrollmentNo,
                address: studentData.address,
                city: studentData.city,
                state: studentData.state,
                pincode: studentData.pincode,
                status: 'NEW_LEAD',
                source: 'lead_conversion',
                leadId: lead.id,
                createdById: req.user.id,
            },
        });

        // Update lead
        await prisma.lead.update({
            where: { id: BigInt(id) },
            data: {
                stage: 'WON',
                convertedAt: new Date(),
            },
        });

        // Create activity
        await prisma.leadActivity.create({
            data: {
                leadId: BigInt(id),
                activityType: 'STAGE_CHANGE',
                description: `Lead converted to student (ID: ${student.id})`,
                previousStage: lead.stage,
                newStage: 'WON',
                createdById: req.user.id,
            },
        });

        res.status(201).json({
            success: true,
            message: 'Lead converted to student successfully',
            data: {
                student: {
                    ...student,
                    id: student.id.toString(),
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get lead statistics
router.get('/stats/summary', async (req, res, next) => {
    try {
        const [
            totalLeads,
            newLeads,
            qualifiedLeads,
            wonLeads,
            lostLeads,
            todayLeads,
            followUpsToday,
        ] = await Promise.all([
            prisma.lead.count(),
            prisma.lead.count({ where: { stage: 'NEW' } }),
            prisma.lead.count({ where: { stage: 'QUALIFIED' } }),
            prisma.lead.count({ where: { stage: 'WON' } }),
            prisma.lead.count({ where: { stage: 'LOST' } }),
            prisma.lead.count({
                where: {
                    createdAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    },
                },
            }),
            prisma.lead.count({
                where: {
                    nextFollowUp: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                        lt: new Date(new Date().setHours(23, 59, 59, 999)),
                    },
                },
            }),
        ]);

        // Conversion rate
        const conversionRate = totalLeads > 0
            ? ((wonLeads / totalLeads) * 100).toFixed(1)
            : 0;

        res.json({
            success: true,
            data: {
                totalLeads,
                newLeads,
                qualifiedLeads,
                wonLeads,
                lostLeads,
                todayLeads,
                followUpsToday,
                conversionRate: parseFloat(conversionRate),
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
