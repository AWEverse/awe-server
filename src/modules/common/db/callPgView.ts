import { PrismaClient } from '@prisma/client';

export async function callPgView<T = any>(prisma: PrismaClient, viewName: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(`SELECT * FROM ${viewName}`);
}
