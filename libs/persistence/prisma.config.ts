import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved the connection string out of the schema. The CLI reads it here; the runtime
 * client gets it through the driver adapter in src/prisma-client.ts. Same variable, two doors.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
