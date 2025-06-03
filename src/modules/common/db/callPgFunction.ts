import { PrismaClient } from '@prisma/client';
import { PgFunctionCallOptions } from './types';

export async function callPgFunction<T = any>(
  prisma: PrismaClient,
  { name, args, argTypes }: PgFunctionCallOptions,
): Promise<T[]> {
  const placeholders = args
    .map((arg, i) => {
      const type = argTypes[i] ?? 'text';
      return `${arg === undefined ? 'null' : `$${i + 1}`}::${type}`;
    })
    .join(', ');

  const sql = `SELECT * FROM ${name}(${placeholders})`;

  return prisma.$queryRawUnsafe<T[]>(sql, ...args.map(arg => arg ?? null));
}
