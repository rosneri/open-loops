import { ApiClient } from './api-client.js';
import { Clock } from './clock.js';
import { loadSchedulerConfig } from './config.js';
import { ConsoleLogger } from './logger.js';

/**
 * The always-on clock. It runs wherever something stays up — a Mac mini under a desk is the
 * intended home — and drives a deployment that cannot schedule for itself.
 *
 * It holds no data and no credentials beyond the shared secret: every schedule is read from the
 * API and every run is a call back to it, so the deployment stays the only thing that touches
 * the database and tenancy is enforced in exactly one place.
 */
const main = async (): Promise<void> => {
  const config = loadSchedulerConfig();
  const logger = new ConsoleLogger();
  const api = new ApiClient(config, logger);
  const clock = new Clock(api, logger);

  const refresh = async (): Promise<void> => {
    try {
      const schedules = await api.schedules();
      clock.apply(schedules);
      logger.info('schedules refreshed', { accounts: schedules.length, jobs: clock.size });
    } catch (error) {
      // Keep the jobs already running: a deployment that is briefly unreachable should not
      // silently stop everyone's sweep.
      logger.error('could not refresh schedules', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await refresh();
  const timer = setInterval(() => void refresh(), config.SCHEDULE_REFRESH_MS);

  const shutdown = (): void => {
    clearInterval(timer);
    clock.stopAll();
    logger.info('scheduler stopped');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('scheduler started', {
    api: config.OPEN_LOOPS_API_URL,
    refreshMs: config.SCHEDULE_REFRESH_MS,
  });
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
