import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 no longer reads `.env` on its own, and it moved the connection string out of the
 * schema entirely. The CLI gets it here; the runtime client gets it from the driver adapter in
 * src/prisma-client.ts. Same variable, two doors, and nothing secret in any tracked file.
 */
loadEnv({ path: ['.env.local', '.env'], quiet: true });

const url = process.env['DATABASE_URL'];
if (url === undefined || url.length === 0) {
  throw new Error('DATABASE_URL is not set. Run `bun run db:up` locally, or link a database.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: { url },
});
