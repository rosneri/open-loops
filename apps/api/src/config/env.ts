import { z } from 'zod';
import { withEnvrc } from './envrc.js';

/**
 * The one place environment is read. Everything downstream receives typed configuration, so no
 * module ever reaches for `process.env` on its own.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().default(4455),
  /**
   * LOCAL  → no OAuth at all; an AI client that already holds your sessions pushes signals in.
   * HOSTED → Composio brokers OAuth for every provider.
   */
  OPEN_LOOPS_MODE: z.enum(['LOCAL', 'HOSTED']).default('LOCAL'),
  OPEN_LOOPS_TIMEZONE: z.string().default('UTC'),
  /** Comma-separated plugin ids. Empty means everything this build shipped with. */
  OPEN_LOOPS_PLUGINS: z.string().optional(),
  /**
   * Seeds the *first* account's identity — the Composio user its connected apps hang off, and
   * the handles that make a signal "to me" — and nothing more. Both live on the account row
   * once claimed, so a second account never shares the first one's OAuth grants and a change of
   * handles is a save rather than a redeploy.
   */
  OPEN_LOOPS_USER_ID: z.string().default('local-user'),
  OPEN_LOOPS_HANDLES: z.string().default(''),
  OPEN_LOOPS_AGENT_TOKEN: z.string().optional(),
  WEB_ORIGIN: z.string().default('*'),

  /**
   * Signs the session cookie. Required rather than optional-with-a-fallback: a generated
   * per-process secret would silently log everyone out on every restart, and a hardcoded
   * default would be worse than no signature at all. Rotating it ends every session.
   */
  AUTH_JWT_SECRET: z.string().min(32, 'AUTH_JWT_SECRET must be at least 32 characters.'),
  AUTH_SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .default(24 * 7),
  /**
   * The invite code a stranger must present to create an account. Unset means there is no
   * registration route at all, which is the default and the honest one for a single-user
   * install: an open signup route on a deployment anyone can reach would undo the login it
   * sits behind. Setting it opens the door exactly as wide as the people you gave the code to.
   *
   * It is a password shared by everyone who may join, not a coupon. Six characters is the floor
   * because a code people type from memory has to be typeable, and the register route is rate
   * limited so a short one cannot be worked through quickly — but the limit counts per instance,
   * so a code protecting a deployment on the public internet should still be much longer.
   */
  AUTH_SIGNUP_INVITE_CODE: z
    .string()
    .min(6, 'AUTH_SIGNUP_INVITE_CODE must be at least 6 characters.')
    .optional(),
  /** Set by Vercel Cron on its own requests; accepted alongside the agent token on /api/tick. */
  CRON_SECRET: z.string().optional(),

  DAY_START_MINUTE: z.coerce
    .number()
    .int()
    .min(0)
    .max(1439)
    .default(9 * 60),
  DAY_END_MINUTE: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(18 * 60),
  /**
   * Seeds the sweep's schedule row on a fresh database and nothing more. Once the row exists,
   * the Settings screen owns it — changing a schedule must not require a redeploy.
   */
  TICK_CRON: z.string().default('0 * * * *'),
  TICK_ON_BOOT: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),

  /**
   * Which registered reasoning provider thinks first. `claude-code` drives the Claude Code
   * already logged in on this machine, so local runs need no API key at all; it is the default
   * in LOCAL mode. Hosted deployments have no CLI and no interactive login, so they default to
   * `anthropic`. Any id a reasoning plugin registered is valid; the keys and binaries each one
   * needs are that plugin's own variables.
   */
  AI_PROVIDER: z.string().min(1).optional(),
  /** An explicit model, in the preferred provider's vocabulary. Each provider has its own default. */
  AI_MODEL: z.string().min(1).optional(),

  COMPOSIO_API_KEY: z.string().optional(),

  /**
   * Set by Vercel on every function invocation. It is the honest test for "can this process
   * hold a cron job": OPEN_LOOPS_MODE answers a different question — where the data comes from
   * — and a machine running in HOSTED mode is still a long-lived process that can schedule.
   */
  VERCEL: z.string().optional(),
});

export type AppConfig = Readonly<z.infer<typeof schema>>;

let cached: AppConfig | undefined;

export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  cached ??= Object.freeze(schema.parse(withEnvrc(source)));
  return cached;
};

export const isLocalMode = (config: AppConfig): boolean => config.OPEN_LOOPS_MODE === 'LOCAL';

/** Whether this deployment has a registration route. Off unless an invite code was configured. */
export const signupEnabled = (config: AppConfig): boolean =>
  config.AUTH_SIGNUP_INVITE_CODE !== undefined;

/**
 * Whether this process outlives a request and can therefore own a scheduler. False on a
 * serverless function, where the platform's own cron is the only clock available.
 */
export const isLongLived = (config: AppConfig): boolean => (config.VERCEL ?? '').length === 0;

/** Local means "use what is already on this machine"; hosted means "use a key". */
export const aiProvider = (config: AppConfig): string =>
  config.AI_PROVIDER ?? (isLocalMode(config) ? 'claude-code' : 'anthropic');

/**
 * The handles the first account starts life with, used to tell "I said" from "they said". Read
 * once, when that account claims its identity; `AccountIdentities` is the answer after that.
 */
export const seedHandles = (config: AppConfig): readonly string[] =>
  [config.OPEN_LOOPS_USER_ID, ...config.OPEN_LOOPS_HANDLES.split(',')]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
