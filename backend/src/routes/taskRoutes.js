import express from 'express';
import prisma from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { notify } from '../services/notificationService.js';

const router = express.Router();

// Helper to serialize BigInt
BigInt.prototype.toJSON = function () { return this.toString() }

// Get all tasks (filtered by role)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { status, priority, due_date, assigned_to } = req.query;
        const user = req.user;

        let whereClause = {};

        // Filter by role
        if (user.role === 'ADMIN') {
            // Admin sees all, or filtered by query
            if (assigned_to) whereClause.assignedToId = parseInt(assigned_to);
        } else if (user.role === 'LEADER') {
            // Leader sees their tasks + their team's tasks
            // First get team members
            const teamMembers = await prisma.user.findMany({
                where: { leaderId: user.id },
                select: { id: true }
            });
            const teamIds = teamMembers.map(m => m.id);

            whereClause = {
                OR: [
                    { assignedToId: user.id }, // Assigned to me
                    { assignedToId: { in: teamIds } }, // Assigned to my team
                    { assignedById: user.id } // Created by me
                ]
            };
        } else {
            // Employee only sees assigned tasks
            whereClause.assignedToId = user.id;
        }

        // Apply filters
        if (status) whereClause.status = status;
        if (priority) whereClause.priority = priority;
        if (due_date) {
            const date = new Date(due_date);
            const nextDay = new Date(date);
            nextDay.setDate(date.getDate() + 1);

            whereClause.dueDate = {
                gte: date,
                lt: nextDay
            };
        }

        const tasks = await prisma.task.findMany({
            where: whereClause,
            include: {
                assignedTo: {
                    select: { id: true, fullName: true, avatar: true }
                },
                assignedBy: {
                    select: { id: true, fullName: true }
                },
                template: {
                    select: { id: true, name: true }
                },
                _count: {
                    select: { updates: true, comments: true }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        res.json({ success: true, count: tasks.length, data: tasks });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch tasks', error: error.message });
    }
});

// Create new task
router.post('/', authenticateToken, requireRole('ADMIN', 'LEADER'), async (req, res) => {
    try {
        const {
            title, description, templateId, customFieldData,
            status, priority, assignedToId, dueDate,
            estimatedHours, attachments
        } = req.body;

        if (!title || !assignedToId) {
            return res.status(400).json({ success: false, message: 'Title and Assignee are required' });
        }

        const task = await prisma.task.create({
            data: {
                title,
                description,
                templateId: templateId ? parseInt(templateId) : null,
                customFieldData,
                status: status || 'TODO',
                priority: priority || 'MEDIUM',
                assignedToId: parseInt(assignedToId),
                assignedById: req.user.id,
                dueDate: dueDate ? new Date(dueDate) : null,
                estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
                attachments,
                startedAt: status === 'IN_PROGRESS' ? new Date() : null
            }
        });

        // Emit socket event (TASK_CREATED)
        const io = req.app.get('io');
        io.emit('task:created', { task, createdBy: req.user.id });

        // Notify assignee (if not assigning to yourself)
        if (parseInt(assignedToId) !== req.user.id) {
            await notify(io, {
                userIds: [parseInt(assignedToId)],
                type: 'TASK_ASSIGNED',
                title: 'New Task Assigned to You',
                message: `"${task.title}" has been assigned to you.`,
                link: `/tasks/${task.id}`,
            });
        }

        // Generate activity log
        await prisma.activityLog.create({
            data: {
                userId: req.user.id,
                action: 'created_task',
                entityType: 'task',
                entityId: task.id.toString(),
                metadata: { title: task.title }
            }
        });

        res.status(201).json({ success: true, data: task });
    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ success: false, message: 'Failed to create task', error: error.message });
    }
});

// Get single task
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const task = await prisma.task.findUnique({
            where: { id: BigInt(id) },
            include: {
                assignedTo: { select: { id: true, fullName: true, avatar: true, email: true } },
                assignedBy: { select: { id: true, fullName: true } },
                template: true,
                updates: {
                    include: { createdBy: { select: { id: true, fullName: true, avatar: true } } },
                    orderBy: { createdAt: 'desc' }
                },
                comments: {
                    include: { createdBy: { select: { id: true, fullName: true, avatar: true } } },
                    orderBy: { createdAt: 'asc' }
                }
            }
        });

        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        // Check permission (Admin, Leader looking at team, or Assignee)
        // For simplicity, we allow reading if logged in, but we could restrict strictly.
        // Given the requirement, visibility seems open within the org hierarchy mostly.

        res.json({ success: true, data: task });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching task', error: error.message });
    }
});

// Update task
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        // Remove restricted fields from direct update if needed
        delete data.id;
        delete data.createdAt;
        delete data.updatedAt;
        delete data.assignedById; // Can't change creator

        // Handle date conversions
        if (data.dueDate) data.dueDate = new Date(data.dueDate);
        if (data.startedAt) data.startedAt = new Date(data.startedAt);
        if (data.completedAt) data.completedAt = new Date(data.completedAt);

        // Check if status changed to completed/in_progress to update timestamps automatically
        if (data.status === 'COMPLETED' && !data.completedAt) {
            data.completedAt = new Date();
        }
        if (data.status === 'IN_PROGRESS' && !data.startedAt) {
            data.startedAt = new Date();
        }

        const task = await prisma.task.update({
            where: { id: BigInt(id) },
            data: {
                ...data,
                lastUpdateAt: new Date()
            }
        });

        // Emit event
        const io = req.app.get('io');
        io.emit('task:updated', { task, updatedBy: req.user.id });

        // Notify task creator if it's someone else updating
        if (task.assignedById && task.assignedById !== req.user.id) {
            await notify(io, {
                userIds: [task.assignedById],
                type: 'TASK_UPDATED',
                title: 'Task Updated',
                message: `Task "${task.title}" was updated by a team member.`,
                link: `/tasks/${task.id}`,
            });
        }

        res.json({ success: true, data: task });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating task', error: error.message });
    }
});

// Add progress update
router.post('/:id/updates', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        // Accept both 'message' and 'content' field names for flexibility
        const { message, content, hoursSpent, attachments } = req.body;
        const updateMessage = message || content || '';

        if (!updateMessage.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        const update = await prisma.taskUpdate.create({
            data: {
                taskId: BigInt(id),
                message: updateMessage,
                hoursSpent: hoursSpent ? parseFloat(hoursSpent) : 0,
                attachments,
                createdById: req.user.id
            }
        });

        // Update task's actual hours and lastUpdateAt
        if (hoursSpent) {
            await prisma.task.update({
                where: { id: BigInt(id) },
                data: {
                    actualHours: { increment: parseFloat(hoursSpent) },
                    lastUpdateAt: new Date()
                }
            });
        } else {
            await prisma.task.update({
                where: { id: BigInt(id) },
                data: { lastUpdateAt: new Date() }
            });
        }

        const io = req.app.get('io');
        io.emit('task:progress', { taskId: id, update, user: req.user.id });

        res.status(201).json({ success: true, data: update });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error adding update', error: error.message });
    }
});

// Delete task
router.delete('/:id', authenticateToken, requireRole('ADMIN'), async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.task.delete({ where: { id: BigInt(id) } });
        res.json({ success: true, message: 'Task deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting task', error: error.message });
    }
});

// Kanban Board data
router.get('/board/kanban', authenticateToken, async (req, res) => {
    try {
        const tasks = await prisma.task.findMany({
            where: {
                // Add filters similar to root get
                OR: [
                    { assignedToId: req.user.id },
                    { assignedById: req.user.id }
                    // Add team logic if LEADER
                ]
            },
            select: {
                id: true, title: true, status: true, priority: true, dueDate: true,
                assignedTo: { select: { fullName: true, avatar: true } }
            }
        });

        // Group by status
        const board = {
            TODO: [], IN_PROGRESS: [], IN_REVIEW: [], BLOCKED: [], COMPLETED: []
        };

        tasks.forEach(t => {
            if (board[t.status]) board[t.status].push(t);
        });

        res.json({ success: true, data: board });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
