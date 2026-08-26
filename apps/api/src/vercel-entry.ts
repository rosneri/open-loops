import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

/**
 * Vercel entry point. The same Nest application that `bun apps/api/src/main.ts` serves, wrapped
 * in a bare Express instance so a warm lambda reuses it instead of rebuilding the container on
 * every request. The tick scheduler still starts, but a serverless instance is short-lived, so
 * production should drive `POST /api/tick` from a Vercel Cron entry instead.
 */
const server = express();

const ready = NestFactory.create(AppModule, new ExpressAdapter(server), {
  logger: ['error', 'warn'],
}).then(async (app) => {
  app.enableCors({ origin: true, credentials: true });
  await app.init();
  return app;
});

export default async function handler(
  request: express.Request,
  response: express.Response,
): Promise<void> {
  await ready;
  server(request, response);
}
