const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.paymentRecord.count().then(c => {
  console.log('Count:', c);
}).catch(e => {
  console.error(e);
}).finally(() => {
  p.$disconnect();
});
