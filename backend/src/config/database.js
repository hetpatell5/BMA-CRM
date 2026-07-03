import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'connection_limit=20&pool_timeout=30',
        },
    },
});

export default prisma;
