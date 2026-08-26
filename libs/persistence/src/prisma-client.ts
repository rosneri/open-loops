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
  client ??=
    globalRef.__openLoopsPrisma ??
    new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      // A hosted database is an order of magnitude further away than one on localhost. The
      // defaults (2s wait, 5s timeout) are tuned for the latter and fail the aggregate writes.
      transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    });
  globalRef.__openLoopsPrisma = client;
  return client;
};
