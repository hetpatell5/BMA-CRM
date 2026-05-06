const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const students = await prisma.$queryRaw`SELECT id, assigned_guide_id, assigned_by_id FROM students WHERE assigned_guide_id IS NOT NULL ORDER BY created_at DESC LIMIT 5`;
  console.log(students);
  process.exit(0);
}

main().catch(console.error);
