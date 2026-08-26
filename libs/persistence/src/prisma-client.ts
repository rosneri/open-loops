import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export type { PrismaClient };

let client: PrismaClient | undefined;

/**
 * A dev server reloads its module graph constantly; without a cached instance every reload
 * opens a fresh pool and Postgres runs out of connections within a minute.
 */
export const createPrismaClient = (connectionString: string): PrismaClient => {
  const globalRef = globalThis as typeof globalThis & { __openLoopsPrisma?: PrismaClient };
  client ??= globalRef.__openLoopsPrisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalRef.__openLoopsPrisma = client;
  return client;
};
