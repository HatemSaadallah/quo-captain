import { PrismaClient } from '@prisma/client';
import { seedMaterials } from './seed-materials';

const prisma = new PrismaClient();
seedMaterials(prisma).catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
