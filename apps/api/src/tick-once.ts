import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { RunTickUseCase } from '@open-loops/orchestration';
import { AppModule } from './app.module.js';
import { Tokens } from './tokens.js';

/** `bun run tick` — one heartbeat by hand, for when you do not want to wait an hour. */
const main = async (): Promise<void> => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const tick = app.get<RunTickUseCase>(Tokens.RunTick);
  process.stdout.write(`${JSON.stringify(await tick.execute(), null, 2)}\n`);
  await app.close();
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
