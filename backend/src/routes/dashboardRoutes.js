import express from 'express';
import prisma from '../config/database.js';

import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get dashboard statistics
router.get('/stats', async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalStudents,
            activeStudents,
            inactiveStudents,
            alumniStudents,
            totalLeads,
            newLeads,
            qualifiedLeads,
            wonLeads,
            todayStudents,
            todayLeads,
            recentImports,
        ] = await Promise.all([
            // Student counts — exclude excel_import rows so dashboard only reflects real orders
            prisma.student.count({ where: { NOT: { source: 'excel_import' } } }),
            prisma.student.count({ where: { NOT: { source: 'excel_import' }, status: { in: ['NEW_LEAD', 'REPORT_IN_PROGRESS', 'SYNOPSIS_SENT', 'GUIDE_ASSIGNED'] } } }),
            prisma.student.count({ where: { NOT: { source: 'excel_import' }, status: 'SHIPPED' } }),
            prisma.student.count({ where: { NOT: { source: 'excel_import' }, status: 'ALL_DONE' } }),

            // Lead counts
            prisma.lead.count(),
            prisma.lead.count({ where: { stage: 'NEW' } }),
            prisma.lead.count({ where: { stage: 'QUALIFIED' } }),
            prisma.lead.count({ where: { stage: 'WON' } }),

            // Today's additions — exclude excel_import
            prisma.student.count({ where: { NOT: { source: 'excel_import' }, createdAt: { gte: today } } }),
            prisma.lead.count({ where: { createdAt: { gte: today } } }),

            // Recent imports
            prisma.importHistory.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    fileName: true,
                    importType: true,
                    status: true,
                    totalRecords: true,
                    importedCount: true,
                    createdAt: true,
                },
            }),
        ]);

        // Lead conversion rate
        const conversionRate = totalLeads > 0
            ? ((wonLeads / totalLeads) * 100).toFixed(1)
            : 0;

        // Categorize orders using raw SQL LIKE on the JSON blob column (fast, no full-table scan into Node memory)
        // Only count real orders (not excel_import bulk rows)
        const countByKeyword = async (keyword) => {
            const result = await prisma.$queryRaw`
                SELECT COUNT(*) as cnt FROM students
                WHERE (source IS NULL OR source != 'excel_import')
                AND LOWER(custom_fields) LIKE ${`%${keyword}%`}
            `;
            return Number(result[0]?.cnt ?? 0);
        };

        const [synopsisCount, reportCount, assignmentCount, practicalCount, guessPaperCount, studyGuideCount, notesCount] = await Promise.all([
            countByKeyword('synopsis'),
            countByKeyword('report'),
            countByKeyword('handwritten assignment'),
            countByKeyword('practical'),
            countByKeyword('guess paper'),
            countByKeyword('study guide'),
            countByKeyword('notes'),
        ]);

        const categories = {
            synopsis: synopsisCount,
            report: reportCount,
            assignment: assignmentCount,
            practical: practicalCount,
            guessPaper: guessPaperCount,
            studyGuide: studyGuideCount,
            notes: notesCount,
        };

        res.json({
            success: true,
            data: {
                students: {
                    total: totalStudents,
                    active: activeStudents,
                    inactive: inactiveStudents,
                    alumni: alumniStudents,
                    today: todayStudents,
                    categories
                },
                leads: {
                    total: totalLeads,
                    new: newLeads,
                    qualified: qualifiedLeads,
                    won: wonLeads,
                    today: todayLeads,
                    conversionRate: parseFloat(conversionRate),
                },
                recentImports: recentImports.map(imp => ({
                    ...imp,
                    id: imp.id.toString(),
                })),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get course-wise distribution
router.get('/charts/course-distribution', async (req, res, next) => {
    try {
        const distribution = await prisma.student.groupBy({
            by: ['course'],
            _count: { id: true },
            where: { course: { not: null } },
            orderBy: { _count: { id: 'desc' } },
            take: 10,
        });

        res.json({
            success: true,
            data: distribution.map(d => ({
                course: d.course,
                count: d._count.id,
            })),
        });
    } catch (error) {
        next(error);
    }
});

// Get batch-wise distribution
router.get('/charts/batch-distribution', async (req, res, next) => {
    try {
        const distribution = await prisma.student.groupBy({
            by: ['batchYear'],
            _count: { id: true },
            where: { batchYear: { not: null } },
            orderBy: { batchYear: 'desc' },
            take: 10,
        });

        res.json({
            success: true,
            data: distribution.map(d => ({
                batchYear: d.batchYear,
                count: d._count.id,
            })),
        });
    } catch (error) {
        next(error);
    }
});

// Get lead pipeline summary
router.get('/charts/lead-pipeline', async (req, res, next) => {
    try {
        const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

        const pipeline = await Promise.all(
            stages.map(async (stage) => ({
                stage,
                count: await prisma.lead.count({ where: { stage } }),
            }))
        );

        res.json({
            success: true,
            data: pipeline,
        });
    } catch (error) {
        next(error);
    }
});

// Get monthly trends
router.get('/charts/monthly-trends', async (req, res, next) => {
    try {
        const months = 6;
        const trends = [];

        for (let i = 0; i < months; i++) {
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - i);
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);

            const [students, leads] = await Promise.all([
                // Only count real orders (manual/form), NOT excel_import bulk imports
                // This prevents large historic imports from spiking the chart
                prisma.student.count({
                    where: {
                        createdAt: {
                            gte: startDate,
                            lt: endDate,
                        },
                        NOT: { source: 'excel_import' },
                    },
                }),
                prisma.lead.count({
                    where: {
                        createdAt: {
                            gte: startDate,
                            lt: endDate,
                        },
                    },
                }),
            ]);

            trends.unshift({
                month: startDate.toLocaleString('default', { month: 'short', year: 'numeric' }),
                students,
                leads,
            });
        }

        res.json({
            success: true,
            data: trends,
        });
    } catch (error) {
        next(error);
    }
});

// Get recent activities
router.get('/activities', async (req, res, next) => {
    try {
        const { limit = 20 } = req.query;

        const activities = await prisma.leadActivity.findMany({
            take: parseInt(limit),
            orderBy: { createdAt: 'desc' },
            include: {
                lead: {
                    select: { id: true, fullName: true },
                },
                createdBy: {
                    select: { id: true, fullName: true },
                },
            },
        });

        res.json({
            success: true,
            data: activities.map(a => ({
                ...a,
                id: a.id.toString(),
                leadId: a.leadId.toString(),
                lead: a.lead ? {
                    ...a.lead,
                    id: a.lead.id.toString(),
                } : null,
            })),
        });
    } catch (error) {
        next(error);
    }
});

// Get follow-ups due today
router.get('/follow-ups/today', async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const followUps = await prisma.lead.findMany({
            where: {
                nextFollowUp: {
                    gte: today,
                    lt: tomorrow,
                },
                stage: { notIn: ['WON', 'LOST'] },
            },
            orderBy: { priority: 'desc' },
            include: {
                assignedTo: {
                    select: { id: true, fullName: true },
                },
            },
        });

        res.json({
            success: true,
            data: followUps.map(f => ({
                ...f,
                id: f.id.toString(),
            })),
        });
    } catch (error) {
        next(error);
    }
});

// Get expert workload and payment summary
router.get('/payments/expert-workload', async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Fetch all STAFF members
        const staffMembers = await prisma.user.findMany({
            where: { role: 'STAFF', status: 'ACTIVE' },
            select: {
                id: true,
                fullName: true,
                staffRole: true,
                assignedStudents: {
                    select: {
                        id: true,
                        status: true,
                        customFields: true,
                    }
                }
            }
        });

        // Compute aggregations per staff
        const workload = staffMembers.map(staff => {
            let ordersHandled = staff.assignedStudents.length;
            let expertPaymentDue = 0;
            let writerPaymentDue = 0;
            let telecallerCommission = 0;
            let totalRevenue = 0;

            staff.assignedStudents.forEach(student => {
                const fields = student.customFields || {};
                
                // Commission = the amount set during role assignment (separate from customer decided price)
                const commissionStr = fields['Commission'] || fields['commission'] || '0';
                const cleanAmount = commissionStr.toString().replace(/[^0-9.]/g, '');
                const commission = parseFloat(cleanAmount) || 0;
                
                // Accumulate commission per staff member
                totalRevenue += commission;
                expertPaymentDue += commission;
            });

            return {
                id: staff.id,
                fullName: staff.fullName,
                staffRole: staff.staffRole,
                ordersHandled,
                expertPaymentDue,
                writerPaymentDue,
                telecallerCommission,
                totalRevenue,
            };
        });

        // Sort by orders handled descending
        workload.sort((a, b) => b.ordersHandled - a.ordersHandled);

        res.json({
            success: true,
            data: workload,
        });
    } catch (error) {
        next(error);
    }
});

// Get comprehensive stats for the Telecaller dashboard
router.get('/telecaller-stats', authenticateToken, async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        // Ensure only telecallers or admins use this
        // but practically it scopes data to the caller anyway.
        
        const todayAtStart = new Date();
        todayAtStart.setHours(0, 0, 0, 0);

        const todayAtEnd = new Date();
        todayAtEnd.setHours(23, 59, 59, 999);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { fullName: true, email: true, role: true }
        });

        // The user expects all 4 orders to show up, including admin-created ones and 'form_submission' ones.
        // So we will fetch all students for the telecaller dashboard for now.
        const myOrders = await prisma.student.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Calculate Revenue bounds
        let totalRevenue = 0;
        let totalCollected = 0;
        let pendingPayment = 0;
        let ordersToday = 0;

        myOrders.forEach(order => {
            if (new Date(order.createdAt) >= todayAtStart && new Date(order.createdAt) <= todayAtEnd) {
                ordersToday++;
            }

            if (order.customFields) {
                // Parse decided price
                const decidedPriceStr = order.customFields['Decided Price'] || order.customFields['Total Order Amount'];
                let price = 0;
                if (decidedPriceStr) {
                    price = Number(String(decidedPriceStr).replace(/[^\d.]/g, ''));
                    if (!Number.isNaN(price)) totalRevenue += price;
                }

                // Parse advance paid
                const advancePaidStr = order.customFields['Advance Paid'];
                let advance = 0;
                if (advancePaidStr) {
                    advance = Number(String(advancePaidStr).replace(/[^\d.]/g, ''));
                    if (!Number.isNaN(advance)) totalCollected += advance;
                }
            }
        });
        
        pendingPayment = Math.max(0, totalRevenue - totalCollected);

        // Fetch leads 
        const myLeads = await prisma.lead.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const pipeline = {
            'NEW': 0,
            'CONTACTED': 0,
            'QUALIFIED': 0,
            'WON': 0,
            'LOST': 0,
        };

        let newLeads = 0;
        let wonLeads = 0;
        let followUpsTodayList = [];
        let overdueLeadsList = [];

        myLeads.forEach(lead => {
            // Pipeline count
            if (pipeline[lead.stage] !== undefined) {
                pipeline[lead.stage]++;
            } else {
                pipeline[lead.stage] = 1;
            }

            if (lead.stage === 'NEW') newLeads++;
            if (lead.stage === 'WON') wonLeads++;

            // Follow-up categorization
            if (lead.nextFollowUp) {
                const followUpDate = new Date(lead.nextFollowUp);
                if (followUpDate >= todayAtStart && followUpDate <= todayAtEnd) {
                    followUpsTodayList.push(lead);
                } else if (followUpDate < todayAtStart) {
                    // Overdue follow up ignores WON/LOST ones ideally
                    if (lead.stage !== 'WON' && lead.stage !== 'LOST') {
                        overdueLeadsList.push(lead);
                    }
                }
            }
        });

        // Calculate how many orders were specifically created manually (source: 'manual' or via telecaller form)
        let createdCount = 0;
        myOrders.forEach(order => {
            if (order.source === 'manual') {
                createdCount++;
            }
            // For older records or different source names
            else if (order.source === 'telecaller' || order.source === 'TELECALLER') {
                createdCount++;
            }
        });

        res.json({
            success: true,
            data: {
                orders: {
                    total: myOrders.length,
                    today: ordersToday,
                    createdCount: createdCount,
                    recentList: myOrders.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8)
                },
                revenue: {
                    total: totalRevenue,
                    collected: totalCollected,
                    pending: pendingPayment,
                },
                leads: {
                    total: myLeads.length,
                    new: newLeads,
                    won: wonLeads,
                    conversionRate: myLeads.length > 0 ? Math.round((wonLeads / myLeads.length) * 100) : 0,
                    followUpsToday: followUpsTodayList.length,
                    overdue: overdueLeadsList.length,
                    followUpList: [...overdueLeadsList, ...followUpsTodayList].sort((a,b) => new Date(a.nextFollowUp) - new Date(b.nextFollowUp)),
                },
                pipeline,
            }
        });

    } catch (error) {
        next(error);
    }
});

// Get payment summary from orders
router.get('/payment-summary', async (req, res, next) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Exclude excel_import rows — payment summary should only reflect real orders
        const allStudents = await prisma.student.findMany({
            where: { NOT: { source: 'excel_import' } },
            select: { customFields: true }
        });

        const parseAmount = (val) => {
            if (!val) return 0;
            const num = Number(String(val).replace(/[^\d.]/g, ''));
            return isNaN(num) ? 0 : num;
        };

        const getField = (fields, ...keys) => {
            for (const key of keys) {
                const match = Object.entries(fields).find(([k]) => k.toLowerCase().includes(key.toLowerCase()));
                if (match) return match[1];
            }
            return null;
        };

        let softCopyTotal = 0;
        let hardCopyTotal = 0;
        let totalCollected = 0;
        let softCopyCollected = 0;
        let hardCopyCollected = 0;

        for (const student of allStudents) {
            const cf = student.customFields || {};
            const deliveryRaw = getField(cf, 'delivery type', 'delivery') || '';
            const delivery = deliveryRaw.toLowerCase();

            const decidedPrice = parseAmount(getField(cf, 'decided price', 'total order amount'));
            const advancePaid = parseAmount(getField(cf, 'advance paid', 'advance'));

            totalCollected += advancePaid;

            if (delivery.includes('soft')) {
                softCopyTotal += decidedPrice;
                softCopyCollected += advancePaid;
            } else if (delivery.includes('hard')) {
                hardCopyTotal += decidedPrice;
                hardCopyCollected += advancePaid;
            }
        }

        const grandTotal = softCopyTotal + hardCopyTotal;
        const totalPending = Math.max(0, grandTotal - totalCollected);

        res.json({
            success: true,
            data: {
                softCopyTotal,
                hardCopyTotal,
                grandTotal,
                totalCollected,
                totalPending,
                softCopyPending: Math.max(0, softCopyTotal - softCopyCollected),
                hardCopyPending: Math.max(0, hardCopyTotal - hardCopyCollected),
            }
        });
    } catch (error) {
        next(error);
    }
});

export default router;

