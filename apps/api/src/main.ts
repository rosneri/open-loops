import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config/env.js';

/**
 * Bound to 0.0.0.0 rather than localhost so the app is reachable from the other devices on the
 * network — the machine's own hostname included.
 */
const bootstrap = async (): Promise<void> => {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  // The session arrives as a cookie, so it has to be parsed before any guard looks for it.
  app.use(cookieParser());

  app.enableCors({
    origin: config.WEB_ORIGIN === '*' ? true : config.WEB_ORIGIN.split(','),
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(config.PORT, '0.0.0.0');
  process.stdout.write(
    `Open Loops API on http://0.0.0.0:${config.PORT} (mode ${config.OPEN_LOOPS_MODE})\n`,
  );
};

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
