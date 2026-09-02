import { Global, Module, type DynamicModule, type Provider } from '@nestjs/common';
import type { Clock, IdGenerator, Logger, SourceProvider } from '@open-loops/kernel';
import { ConnectionMode } from '@open-loops/integrations';
import {
  PrismaUserRepository,
  PrismaSettingsRepository,
  PrismaScheduleRepository,
  createPrismaClient,
  type PrismaClient,
} from '@open-loops/persistence';
import { ComposioSessionRegistry } from '@open-loops/connectors-composio';
import type { AudioStore, PodcastGenerator } from '@open-loops/podcast';
import { ElevenLabsPodcastGenerator } from '@open-loops/connectors-elevenlabs';
import {
  EdgeSpeechSynthesizer,
  ScriptedPodcastGenerator,
} from '@open-loops/connectors-studio';
import type { StructuredGenerator } from '@open-loops/reasoning';
import {
  AiSdkGenerator,
  ClaudeCodeGenerator,
  FallbackGenerator,
  ModelLoopExtractor,
  ModelLoopReconciler,
  lazyModel,
} from '@open-loops/reasoning';
import { PluginHost, ProbeCatalog, ScheduleCatalog, SourceCatalog } from '@open-loops/plugin-host';
import type { AppConfig } from '../config/env.js';
import type { BuiltInSchedules } from '../modules/settings/built-in-schedules.js';
import { builtInSchedules } from '../modules/settings/built-in-schedules.js';
import type { SettingsStores } from '../modules/settings/settings.service.js';
import { aiModel, aiProvider, isLocalMode, isLongLived, loadConfig } from '../config/env.js';
import { AccountIdentities } from './account-identity.service.js';
import { SourceStackFactory } from './source-stack.factory.js';
import { BlobAudioStore } from './blob-audio-store.js';
import { FileAudioStore } from './file-audio-store.js';
import { SystemClock } from '../system/system-clock.js';
import { UuidIdGenerator } from '../system/uuid-id-generator.js';
import { JsonLogger } from '../system/json-logger.js';
import { Tokens } from '../tokens.js';

const base: Provider[] = [
  { provide: Tokens.Config, useFactory: (): AppConfig => loadConfig() },
  {
    provide: Tokens.Logger,
    inject: [Tokens.Config],
    useFactory: (config: AppConfig): Logger => new JsonLogger(isLocalMode(config) ? 'debug' : 'info'),
  },
  {
    provide: Tokens.Clock,
    inject: [Tokens.Config],
    useFactory: (config: AppConfig): Clock => new SystemClock(config.OPEN_LOOPS_TIMEZONE),
  },
  { provide: Tokens.Ids, useFactory: (): IdGenerator => new UuidIdGenerator() },
  {
    provide: Tokens.Prisma,
    inject: [Tokens.Config],
    useFactory: (config: AppConfig): PrismaClient => createPrismaClient(config.DATABASE_URL),
  },
];

/**
 * Only the stores that are genuinely global live here. Everything owned by a person is built
 * per request by `WorkspaceFactory`, which is what makes tenancy impossible to forget.
 */
const persistence: Provider[] = [
  {
    provide: Tokens.UserRepository,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new PrismaUserRepository(prisma),
  },
  {
    provide: Tokens.SettingsRepository,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new PrismaSettingsRepository(prisma),
  },
  {
    provide: Tokens.ScheduleRepository,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new PrismaScheduleRepository(prisma),
  },
  {
    /** Always read together, so they are injected together rather than one argument each. */
    provide: Tokens.SettingsStores,
    inject: [Tokens.SettingsRepository, Tokens.ScheduleRepository],
    useFactory: (
      settings: PrismaSettingsRepository,
      schedules: PrismaScheduleRepository,
    ): SettingsStores => ({ settings, schedules }),
  },
  {
    provide: Tokens.BuiltInSchedules,
    inject: [Tokens.Config, Tokens.PodcastReadiness, Tokens.SettingsRepository],
    useFactory: (
      config: AppConfig,
      podcastReady: boolean,
      settings: PrismaSettingsRepository,
    ): BuiltInSchedules => builtInSchedules({ config, podcastReady, settings }),
  },
];

const podcast: Provider[] = [
  {
    /**
     * The in-house studio by default: the model this deployment already pays for writes the
     * script, and the free Edge voices read it, so a daily episode costs nothing and needs no
     * new account. ElevenLabs is there for anyone who wants its voices and has a key.
     */
    provide: Tokens.PodcastGenerator,
    inject: [Tokens.Config, Tokens.Logger, Tokens.StructuredGenerator],
    useFactory: (
      config: AppConfig,
      logger: Logger,
      model: StructuredGenerator,
    ): PodcastGenerator => {
      if (config.PODCAST_PROVIDER === 'elevenlabs') {
        return new ElevenLabsPodcastGenerator(
          {
            apiKey: config.ELEVENLABS_API_KEY,
            modelId: config.ELEVENLABS_MODEL_ID,
            hostVoiceId: config.ELEVENLABS_HOST_VOICE_ID,
            guestVoiceId: config.ELEVENLABS_GUEST_VOICE_ID,
            timeoutMs: config.ELEVENLABS_TIMEOUT_MS,
            pollIntervalMs: config.ELEVENLABS_POLL_MS,
          },
          logger,
        );
      }
      return new ScriptedPodcastGenerator({
        model,
        speech: new EdgeSpeechSynthesizer(),
        voices: { host: config.STUDIO_HOST_VOICE, guest: config.STUDIO_GUEST_VOICE },
        logger,
      });
    },
  },
  {
    /**
     * Blob when a token exists, disk otherwise — but only where a disk means anything. Falling
     * back to the filesystem is what lets a developer hear an episode without attaching a store
     * first; on a serverless function the same fallback writes to a read-only directory that
     * would not outlive the request, so there the answer is "no store", said out loud.
     */
    provide: Tokens.AudioStore,
    inject: [Tokens.Config],
    useFactory: (config: AppConfig): AudioStore =>
      (config.BLOB_READ_WRITE_TOKEN ?? '').length > 0 || !isLongLived(config)
        ? new BlobAudioStore(config.BLOB_READ_WRITE_TOKEN)
        : new FileAudioStore(config.PODCAST_DIR),
  },
  {
    /**
     * Whether an episode can actually be produced *and* kept. The generator needs no key, so it
     * alone always says yes — and the Settings screen would offer a button that fails on the
     * write. Both halves have to be ready for the answer to be true.
     */
    provide: Tokens.PodcastReadiness,
    inject: [Tokens.PodcastGenerator, Tokens.AudioStore],
    useFactory: (generator: PodcastGenerator, audio: AudioStore): boolean =>
      generator.isConfigured() && audio.isConfigured(),
  },
];

const dataStrategy: Provider[] = [
  {
    provide: Tokens.ConnectionMode,
    inject: [Tokens.Config],
    useFactory: (config: AppConfig) =>
      isLocalMode(config) ? ConnectionMode.LocalAgent : ConnectionMode.Hosted,
  },
  {
    /**
     * A registry, not a session. Composio keys connected accounts to a user id, and that id now
     * comes from the account row — so nothing here can talk to Composio without first saying
     * whose connections it wants.
     */
    provide: Tokens.ComposioSessions,
    inject: [Tokens.Config, Tokens.Logger, AccountIdentities],
    useFactory: (
      config: AppConfig,
      logger: Logger,
      identities: AccountIdentities,
    ): ComposioSessionRegistry | undefined => {
      if (config.COMPOSIO_API_KEY === undefined || config.COMPOSIO_API_KEY.length === 0) {
        return undefined;
      }
      return new ComposioSessionRegistry({
        apiKey: config.COMPOSIO_API_KEY,
        logger,
        identity: async (ownerId) => await identities.composioUserId(ownerId),
      });
    },
  },
  {
    provide: Tokens.KnownProviders,
    inject: [Tokens.SourceCatalog],
    useFactory: (sources: SourceCatalog): readonly SourceProvider[] => sources.providers(),
  },
  {
    /**
     * Locally there is no OAuth to run, so everything the agent could push counts as connectable.
     * Hosted, only the apps that named a toolkit can actually be authorised — offering the rest
     * would be a Connect button that fails.
     */
    provide: Tokens.ConnectableProviders,
    inject: [Tokens.Config, Tokens.SourceCatalog],
    useFactory: (config: AppConfig, sources: SourceCatalog): readonly SourceProvider[] =>
      isLocalMode(config) ? sources.providers() : sources.connectable(),
  },
];

/**
 * Per-account services. They are singletons in the container and factories in behaviour: each
 * hands out an object already bound to one owner, which is the same trick `WorkspaceFactory`
 * plays for the database.
 */
const identity: Provider[] = [AccountIdentities, SourceStackFactory];

/**
 * The plugins load before anything that depends on what they registered, which is everything
 * interesting: the extractor's prompt, the schema it is held to and the runners that answer it
 * all come out of this. A plugin that fails to set up fails the boot rather than quietly
 * removing a feature.
 */
const plugins: Provider[] = [
  {
    provide: Tokens.ProbeCatalog,
    inject: [Tokens.PluginHost],
    useFactory: (host: PluginHost): ProbeCatalog => ProbeCatalog.from(host),
  },
  {
    provide: Tokens.SourceCatalog,
    inject: [Tokens.PluginHost],
    useFactory: (host: PluginHost): SourceCatalog => SourceCatalog.from(host),
  },
  {
    provide: Tokens.ScheduleCatalog,
    inject: [Tokens.PluginHost],
    useFactory: (host: PluginHost): ScheduleCatalog => ScheduleCatalog.from(host),
  },
];

const reasoning: Provider[] = [
  {
    provide: Tokens.StructuredGenerator,
    inject: [Tokens.Config, Tokens.Logger],
    useFactory: (config: AppConfig, logger: Logger): StructuredGenerator =>
      generatorFor({ config, logger }),
  },
  {
    provide: Tokens.LoopExtractor,
    inject: [Tokens.StructuredGenerator, Tokens.ProbeCatalog, Tokens.Logger],
    useFactory: (generator: StructuredGenerator, catalog: ProbeCatalog, logger: Logger) =>
      new ModelLoopExtractor({ generator, catalog, logger }),
  },
  {
    provide: Tokens.LoopReconciler,
    inject: [Tokens.StructuredGenerator, Tokens.Logger],
    useFactory: (generator: StructuredGenerator, logger: Logger) =>
      new ModelLoopReconciler({ generator, logger }),
  },
];

/**
 * The one place that decides who does the thinking. Claude Code first when it is the configured
 * provider — it costs nothing and needs no key — with a keyed provider behind it so a usage
 * limit degrades to a bill instead of to an outage.
 */
const generatorFor = (input: { config: AppConfig; logger: Logger }): StructuredGenerator => {
  const { config, logger } = input;
  const provider = aiProvider(config);
  const chain: StructuredGenerator[] = [];

  if (provider === 'claude-code') {
    chain.push(
      new ClaudeCodeGenerator({
        logger,
        model: aiModel(config),
        binary: config.CLAUDE_CODE_BIN,
        timeoutMs: config.CLAUDE_CODE_TIMEOUT_MS,
      }),
    );
  }

  const keyed = keyedGenerator({ config, provider });
  if (keyed !== undefined) chain.push(keyed);

  const [first, ...rest] = chain;
  if (first === undefined) {
    throw new Error(
      'No reasoning provider is available. Install Claude Code, or set ANTHROPIC_API_KEY.',
    );
  }
  return rest.length === 0 ? first : new FallbackGenerator({ generators: chain, logger });
};

const keyedGenerator = (input: {
  config: AppConfig;
  provider: ReturnType<typeof aiProvider>;
}): StructuredGenerator | undefined => {
  const { config } = input;
  const provider = input.provider === 'claude-code' ? 'anthropic' : input.provider;
  const key = provider === 'openai' ? config.OPENAI_API_KEY : config.ANTHROPIC_API_KEY;
  if (key === undefined || key.length === 0) return undefined;

  const model = input.provider === 'claude-code' ? FALLBACK_MODEL : aiModel(config);
  return new AiSdkGenerator({
    label: `${provider}/${model}`,
    model: lazyModel({
      provider,
      model,
      ...(provider === 'openai' ? { openaiApiKey: key } : { anthropicApiKey: key }),
    }),
  });
};

/** `sonnet` is a CLI alias; the API needs a real model id. */
const FALLBACK_MODEL = 'claude-sonnet-5';

const ALL = [
  ...base,
  ...persistence,
  ...plugins,
  ...podcast,
  ...dataStrategy,
  ...identity,
  ...reasoning,
];

/**
 * The composition root: the single place where interfaces meet implementations. It is global
 * so feature modules can inject ports without re-declaring providers.
 */
const EXPORTS = ALL.map((provider) =>
  typeof provider === 'function' ? provider : (provider as { provide: string }).provide,
);

@Global()
@Module({})
export class InfrastructureModule {
  /**
   * The plugins are loaded before the container exists, because the container is partly made of
   * what they registered — the probe catalog, the source catalog, the extractor's prompt. Passing
   * the loaded host in as a value rather than resolving it as an async provider is what keeps
   * that order impossible to get wrong.
   */
  public static forHost(host: PluginHost): DynamicModule {
    const providers = [{ provide: Tokens.PluginHost, useValue: host }, ...ALL];
    return {
      module: InfrastructureModule,
      providers,
      exports: [Tokens.PluginHost, ...EXPORTS],
    };
  }
}
