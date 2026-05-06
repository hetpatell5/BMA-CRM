import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Updating order statuses...");
  try {
      await prisma.$executeRawUnsafe(`ALTER TYPE "StudentStatus" ADD VALUE IF NOT EXISTS 'SHIPPED';`);
  } catch (e) {
      console.log("Enum values might already exist", e.message);
  }
  
  const result = await prisma.$executeRawUnsafe(`UPDATE students SET status = 'NEW_LEAD' WHERE status::text IN ('ACTIVE', 'INACTIVE', 'ALUMNI', 'DROPPED');`);
  console.log("Rows updated to NEW_LEAD");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
