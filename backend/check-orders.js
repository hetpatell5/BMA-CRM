import prisma from './src/config/database.js';

BigInt.prototype.toJSON = function () { return this.toString(); };

async function main() {
    const students = await prisma.student.findMany({
        select: {
            id: true,
            fullName: true,
            createdById: true,
            customFields: true,
            createdAt: true
        },
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    console.log(JSON.stringify(students, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
