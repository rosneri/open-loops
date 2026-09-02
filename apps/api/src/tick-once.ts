import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createAppModule } from './app.module.js';
import { WorkspaceFactory } from './infrastructure/workspace.factory.js';
import { OwnerResolver } from './modules/auth/owner-resolver.service.js';

/**
 * `bun run tick [username]` — one heartbeat by hand, for when you do not want to wait for the
 * schedule. The username may be omitted while there is only one account.
 */
const main = async (): Promise<void> => {
  const app = await NestFactory.createApplicationContext(await createAppModule(), {
    logger: ['error', 'warn'],
  });
  try {
    const ownerId = await app.get(OwnerResolver).resolve(process.argv[2]);
    const { tick } = app.get(WorkspaceFactory).for(ownerId);
    process.stdout.write(`${JSON.stringify(await tick.execute(), null, 2)}\n`);
  } finally {
    await app.close();
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
