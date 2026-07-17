import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seed...');

    // Create admin user
    const adminPassword = await bcrypt.hash('admin123', 12);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@crm.com' },
        update: {
            passwordHash: adminPassword,
            status: 'ACTIVE'
        },
        create: {
            email: 'admin@crm.com',
            passwordHash: adminPassword,
            fullName: 'Admin User',
            role: 'ADMIN',
            status: 'ACTIVE',
        },
    });

    console.log('✅ Admin user created:', admin.email);

    console.log('');
    console.log('🎉 Database seeding completed!');
    console.log('');
    console.log('📧 Login credentials:');
    console.log('   Admin:   admin@crm.com / admin123');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
