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
  OPEN_LOOPS_USER_ID: z.string().default('local-user'),
  OPEN_LOOPS_HANDLES: z.string().default(''),
  OPEN_LOOPS_AGENT_TOKEN: z.string().optional(),
  WEB_ORIGIN: z.string().default('*'),

  DAY_START_MINUTE: z.coerce.number().int().min(0).max(1439).default(9 * 60),
  DAY_END_MINUTE: z.coerce.number().int().min(1).max(1440).default(18 * 60),
  TICK_CRON: z.string().default('0 * * * *'),
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
});

export type AppConfig = Readonly<z.infer<typeof schema>>;

let cached: AppConfig | undefined;

export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  cached ??= Object.freeze(schema.parse(withEnvrc(source)));
  return cached;
};

export const isLocalMode = (config: AppConfig): boolean => config.OPEN_LOOPS_MODE === 'LOCAL';

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

/** Handles that identify the user across providers, used to tell "I said" from "they said". */
export const meHandles = (config: AppConfig): readonly string[] =>
  [config.OPEN_LOOPS_USER_ID, ...config.OPEN_LOOPS_HANDLES.split(',')]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
