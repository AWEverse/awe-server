import { PrismaClient } from '@prisma/client';

export async function callPgViewAdaptive<T = any>(
  prisma: PrismaClient,
  viewName: string,
  maxRetries: number = 3,
): Promise<T[]> {
  if (!viewName || typeof viewName !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(viewName)) {
    throw new Error('Invalid view name');
  }

  const schemaQualifiedName = viewName.includes('.') ? viewName : `public.${viewName}`;
  const sql = `SELECT * FROM ${schemaQualifiedName}`;

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$queryRawUnsafe<T[]>(sql);
    } catch (error) {
      lastError = error as Error;

      if (error instanceof Error) {
        const message = error.message.toLowerCase();

        if (
          message.includes('syntax error') ||
          message.includes('relation does not exist') ||
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
