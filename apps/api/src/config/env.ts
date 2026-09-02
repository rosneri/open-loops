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
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  /** Set by Vercel Cron on its own requests; accepted alongside the agent token on /api/tick. */
  CRON_SECRET: z.string().optional(),

  DAY_START_MINUTE: z.coerce.number().int().min(0).max(1439).default(9 * 60),
  DAY_END_MINUTE: z.coerce.number().int().min(1).max(1440).default(18 * 60),
  TICK_CRON: z.string().default('0 * * * *'),
  /**
   * Seeds the settings row on a fresh database and nothing more. Once the row exists, the
   * Settings screen owns both schedules — changing one must not require a redeploy.
   */
  PODCAST_CRON: z.string().default('0 7 * * *'),
  TICK_ON_BOOT: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),

  /**
   * `claude-code` drives the Claude Code already logged in on this machine, so local runs need
   * no API key at all. It is the default in LOCAL mode; hosted deployments have no CLI and no
   * interactive login, so they fall back to a keyed provider.
   */
  AI_PROVIDER: z.enum(['claude-code', 'anthropic', 'openai']).optional(),
  AI_MODEL: z.string().optional(),
  CLAUDE_CODE_BIN: z.string().default('claude'),
  CLAUDE_CODE_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(900_000).default(240_000),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  COMPOSIO_API_KEY: z.string().optional(),

  /**
   * `studio` runs podcastfy's pipeline in this process — the configured model writes a
   * two-speaker script and the free Edge Read Aloud voices speak it. No key, no ffmpeg, no
   * Python, no cost. `elevenlabs` swaps in that hosted service for anyone who prefers its
   * voices and has a key.
   */
  PODCAST_PROVIDER: z.enum(['studio', 'elevenlabs']).default('studio'),
  /** Edge voice names. `en-US-AndrewNeural` and `en-US-AvaNeural` are the conversational pair. */
  STUDIO_HOST_VOICE: z.string().default('en-US-AndrewNeural'),
  STUDIO_GUEST_VOICE: z.string().default('en-US-AvaNeural'),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL_ID: z.string().default('eleven_multilingual_v2'),
  /** ElevenLabs' stock "Adam" and "Rachel"; overridden per-episode from Settings. */
  ELEVENLABS_HOST_VOICE_ID: z.string().default('pNInz6obpgDQGcFmaJgB'),
  ELEVENLABS_GUEST_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  ELEVENLABS_TIMEOUT_MS: z.coerce.number().int().min(30_000).max(1_800_000).default(600_000),
  ELEVENLABS_POLL_MS: z.coerce.number().int().min(1_000).max(60_000).default(5_000),
  /** Set automatically when a Vercel Blob store is attached to the project. */
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  /** Where episodes are written when there is no blob store. Gitignored. */
  PODCAST_DIR: z.string().default('.podcasts'),

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

/**
 * Whether this process outlives a request and can therefore own a scheduler. False on a
 * serverless function, where the platform's own cron is the only clock available.
 */
export const isLongLived = (config: AppConfig): boolean => (config.VERCEL ?? '').length === 0;

export type AiProvider = 'claude-code' | 'anthropic' | 'openai';

/** Local means "use what is already on this machine"; hosted means "use a key". */
export const aiProvider = (config: AppConfig): AiProvider =>
  config.AI_PROVIDER ?? (isLocalMode(config) ? 'claude-code' : 'anthropic');

const DEFAULT_MODELS: Record<AiProvider, string> = {
  'claude-code': 'sonnet',
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.2',
};

export const aiModel = (config: AppConfig): string =>
  config.AI_MODEL ?? DEFAULT_MODELS[aiProvider(config)];

/**
 * The handles the first account starts life with, used to tell "I said" from "they said". Read
 * once, when that account claims its identity; `AccountIdentities` is the answer after that.
 */
export const seedHandles = (config: AppConfig): readonly string[] =>
  [config.OPEN_LOOPS_USER_ID, ...config.OPEN_LOOPS_HANDLES.split(',')]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
