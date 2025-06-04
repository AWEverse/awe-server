import { PrismaClient } from '@prisma/client';
import { PgFunctionCallOptions } from './types';

export async function callPgFunctionAdaptive<T = any>(
  prisma: PrismaClient,
  options: PgFunctionCallOptions,
  maxRetries: number = 3,
): Promise<T[]> {
  const { name, args = [], argTypes = [] } = options;

  if (!name || typeof name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error('Invalid function name');
  }

  const sanitizedArgs = args.map(arg => arg ?? null);
  const sanitizedArgTypes = argTypes.length ? argTypes : args.map(() => 'text');

  if (sanitizedArgs.length !== sanitizedArgTypes.length) {
    throw new Error('Mismatch between arguments and their types');
  }

  const validPgTypes = new Set([
    'text',
    'varchar',
    'integer',
    'bigint',
    'boolean',
    'numeric',
    'date',
    'timestamp',
    'timestamptz',
    'json',
    'jsonb',
    'uuid',
  ]);

  const placeholders = sanitizedArgs
    .map((arg, i) => {
      const type = sanitizedArgTypes[i].toLowerCase();
      if (!validPgTypes.has(type)) {
        throw new Error(`Invalid PostgreSQL type: ${type}`);
      }
      return `${arg === null ? 'NULL' : `$${i + 1}`}::${type}`;
    })
    .join(', ');

  const schemaQualifiedName = name.includes('.') ? name : `public.${name}`;
  const sql = `SELECT * FROM ${schemaQualifiedName}(${placeholders})`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$queryRawUnsafe<T[]>(sql, ...sanitizedArgs);
    } catch (error) {
      lastError = error as Error;

      if (error instanceof Error) {
        const message = error.message.toLowerCase();

        if (
          message.includes('syntax error') ||
          message.includes('function does not exist') ||
          message.includes('permission denied')
        ) {
          throw new Error(`Fatal database error: ${error.message}`);
        }
      }

      const delayMs = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}
