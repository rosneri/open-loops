import { z } from 'zod';

/**
 * The scheduler needs far less than the API: where to call, what to prove it is allowed, and
 * how often to re-read the schedules. It deliberately has no database URL — everything it does
 * goes through the same HTTP surface a person uses, so there is one place enforcing tenancy.
 */
const schema = z.object({
  /** The deployment to drive. Point this at the production URL from the always-on machine. */
  OPEN_LOOPS_API_URL: z.url(),
  /**
   * Presented as a bearer token. Must match OPEN_LOOPS_AGENT_TOKEN or CRON_SECRET on the API —
   * these calls have no session, and the API must not accept an unauthenticated sweep.
   */
  OPEN_LOOPS_AGENT_TOKEN: z.string().min(1),
  /**
   * How often to re-read who exists and when they want things. A change made in Settings takes
   * effect within one of these rather than on a restart.
   */
  SCHEDULE_REFRESH_MS: z.coerce.number().int().min(30_000).max(3_600_000).default(300_000),
  /** A sweep can be minutes of model work; a podcast longer still. */
  SWEEP_TIMEOUT_MS: z.coerce.number().int().min(60_000).default(900_000),
  PODCAST_TIMEOUT_MS: z.coerce.number().int().min(60_000).default(1_800_000),
});

export type SchedulerConfig = Readonly<z.infer<typeof schema>>;

export const loadSchedulerConfig = (source: NodeJS.ProcessEnv = process.env): SchedulerConfig =>
  Object.freeze(schema.parse(source));
