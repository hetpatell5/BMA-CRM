import prisma from '../config/database.js';

const ALERT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const UPDATE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export const startAlertService = (io) => {
    console.log('⏰ Alert Service started...');

    // Run checks periodically
    setInterval(() => checkTaskUpdates(io), ALERT_INTERVAL_MS);

    // Run immediate check on start (optional, maybe delay slightly)
    setTimeout(() => checkTaskUpdates(io), 10000);
};

const checkTaskUpdates = async (io) => {
    try {
        console.log('Running task update check...');
        const thresholdDate = new Date(Date.now() - UPDATE_THRESHOLD_MS);

        // Find tasks in progress that haven't been updated recently
        const stagnantTasks = await prisma.task.findMany({
            where: {
                status: 'IN_PROGRESS',
                lastUpdateAt: {
                    lt: thresholdDate
                }
            },
            include: {
                assignedTo: { select: { id: true, fullName: true, leaderId: true } },
                assignedBy: { select: { id: true } }
            }
        });

        if (stagnantTasks.length === 0) return;

        console.log(`Found ${stagnantTasks.length} stagnant tasks.`);

        for (const task of stagnantTasks) {
            // Send alert to Employee
            const employeeId = task.assignedTo.id;
            io.to(`user-${employeeId}`).emit('alert:no-update', {
                taskId: task.id.toString(),
                taskTitle: task.title,
                message: `Please update progress on "${task.title}". No updates in 2 hours.`
            });

            // Send alert to Leader (if exists)
            if (task.assignedTo.leaderId) {
                io.to(`user-${task.assignedTo.leaderId}`).emit('alert:no-update', {
                    taskId: task.id.toString(),
                    taskTitle: task.title,
                    message: `Employee ${task.assignedTo.fullName} hasn't updated "${task.title}" in 2 hours.`
                });
            }

            // Send alert to Admin (or Creator)
            // Assuming Admin listens to a generic channel or specific user channel? 
            // Let's assume admins join 'admin-alerts' room or simliar, or just notify creator
            if (task.assignedBy.id) {
                io.to(`user-${task.assignedBy.id}`).emit('alert:no-update', {
                    taskId: task.id.toString(),
                    taskTitle: task.title,
                    message: `No update on "${task.title}" by ${task.assignedTo.fullName} in 2 hours.`
                });
            }
        }

    } catch (error) {
        console.error('Alert Service Error:', error);
    }
};
