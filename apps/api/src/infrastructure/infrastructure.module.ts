import { Global, Module, type Provider } from '@nestjs/common';
import type { Clock, IdGenerator, Logger, SourceProvider } from '@open-loops/kernel';
import { ALL_SOURCE_PROVIDERS } from '@open-loops/kernel';
import type { ConnectionBroker } from '@open-loops/integrations';
import { ConnectionMode } from '@open-loops/integrations';
import type { ProbeRunner } from '@open-loops/loops';
import type { SourceConnector } from '@open-loops/signals';
import {
  PrismaDailyPlanRepository,
  PrismaIntegrationRepository,
  PrismaLoopEventPublisher,
  PrismaOpenLoopRepository,
  PrismaProbeTaskStore,
  PrismaSignalStore,
  PrismaSyncCursorStore,
  SignalBusyTimeProvider,
  createPrismaClient,
  type PrismaClient,
} from '@open-loops/persistence';
import {
  COMPOSIO_PROVIDERS,
  ComposioConnectionBroker,
  ComposioProbeRunner,
  ComposioSessionProvider,
  ComposioSourceConnector,
  ComposioToolExplorer,
} from '@open-loops/connectors-composio';
import {
  LocalAgentSourceConnector,
  LocalConnectionBroker,
  LocalProbeRunner,
} from '@open-loops/connectors-local';
import type { StructuredGenerator } from '@open-loops/reasoning';
import {
  AiSdkGenerator,
  ClaudeCodeGenerator,
  FallbackGenerator,
  ModelLoopExtractor,
  ModelLoopReconciler,
  lazyModel,
} from '@open-loops/reasoning';
import type { AppConfig } from '../config/env.js';
import { aiModel, aiProvider, isLocalMode, loadConfig, meHandles } from '../config/env.js';
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

const persistence: Provider[] = [
  {
    provide: Tokens.LoopRepository,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new PrismaOpenLoopRepository(prisma),
  },
  {
    provide: Tokens.PlanRepository,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new PrismaDailyPlanRepository(prisma),
  },
  {
    provide: Tokens.IntegrationRepository,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new PrismaIntegrationRepository(prisma),
  },
  {
    provide: Tokens.SignalStore,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new PrismaSignalStore(prisma),
  },
  {
    provide: Tokens.SyncCursorStore,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new PrismaSyncCursorStore(prisma),
  },
  {
    provide: Tokens.EventPublisher,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new PrismaLoopEventPublisher(prisma),
  },
  {
    provide: Tokens.BusyTimeProvider,
    inject: [Tokens.Prisma],
    useFactory: (prisma: PrismaClient) => new SignalBusyTimeProvider(prisma),
  },
  {
    provide: Tokens.ProbeTaskStore,
    inject: [Tokens.Prisma, Tokens.Logger],
    useFactory: (prisma: PrismaClient, logger: Logger) =>
      new PrismaProbeTaskStore({ prisma, logger }),
  },
];

/**
 * The strategy switch, and the only branch in the system that knows local from hosted. Every
 * use case above it is written against ports and has no idea which world it is running in.
 */
const dataStrategy: Provider[] = [
  {
    provide: Tokens.ConnectionMode,
    inject: [Tokens.Config],
    useFactory: (config: AppConfig) =>
      isLocalMode(config) ? ConnectionMode.LocalAgent : ConnectionMode.Hosted,
  },
  {
    provide: Tokens.ToolExplorer,
    inject: [Tokens.Config, Tokens.Logger],
    useFactory: (config: AppConfig, logger: Logger): ComposioToolExplorer | undefined => {
      if (config.COMPOSIO_API_KEY === undefined || config.COMPOSIO_API_KEY.length === 0) {
        return undefined;
      }
      const sessions = new ComposioSessionProvider({
        userId: config.OPEN_LOOPS_USER_ID,
        apiKey: config.COMPOSIO_API_KEY,
        logger,
      });
      return new ComposioToolExplorer({ sessions, logger });
    },
  },
  {
    provide: Tokens.ConnectableProviders,
    inject: [Tokens.Config],
    useFactory: (config: AppConfig): readonly SourceProvider[] =>
      isLocalMode(config) ? ALL_SOURCE_PROVIDERS : COMPOSIO_PROVIDERS,
  },
  {
    provide: Tokens.SourceConnectors,
    inject: [Tokens.Config, Tokens.Logger, Tokens.ToolExplorer],
    useFactory: (
      config: AppConfig,
      logger: Logger,
      explorer: ComposioToolExplorer | undefined,
    ): readonly SourceConnector[] =>
      isLocalMode(config) || explorer === undefined
        ? [new LocalAgentSourceConnector(logger)]
        : [new ComposioSourceConnector({ explorer, logger, meHandles: meHandles(config) })],
  },
  {
    provide: Tokens.ConnectionBroker,
    inject: [Tokens.Config, Tokens.Logger],
    useFactory: (config: AppConfig, logger: Logger): ConnectionBroker => {
      if (isLocalMode(config) || config.COMPOSIO_API_KEY === undefined) {
        return new LocalConnectionBroker();
      }
      const sessions = new ComposioSessionProvider({
        userId: config.OPEN_LOOPS_USER_ID,
        apiKey: config.COMPOSIO_API_KEY,
        logger,
      });
      return new ComposioConnectionBroker({ sessions, logger });
    },
  },
  {
    provide: Tokens.ProbeRunners,
    inject: [Tokens.Config, Tokens.Logger, Tokens.ToolExplorer, Tokens.ProbeTaskStore],
    useFactory: (
      config: AppConfig,
      logger: Logger,
      explorer: ComposioToolExplorer | undefined,
      probeTasks: PrismaProbeTaskStore,
    ): readonly ProbeRunner[] =>
      isLocalMode(config) || explorer === undefined
        ? [new LocalProbeRunner(probeTasks)]
        : [new ComposioProbeRunner({ explorer, logger })],
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
    inject: [Tokens.StructuredGenerator, Tokens.Logger],
    useFactory: (generator: StructuredGenerator, logger: Logger) =>
      new ModelLoopExtractor({ generator, logger }),
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

  if (chain.length === 0) {
    throw new Error(
      'No reasoning provider is available. Install Claude Code, or set ANTHROPIC_API_KEY.',
    );
  }
  return chain.length === 1 ? (chain[0] as StructuredGenerator) : new FallbackGenerator({ generators: chain, logger });
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

const ALL = [...base, ...persistence, ...dataStrategy, ...reasoning];

/**
 * The composition root: the single place where interfaces meet implementations. It is global
 * so feature modules can inject ports without re-declaring providers.
 */
@Global()
@Module({ providers: ALL, exports: ALL.map((provider) => (provider as { provide: string }).provide) })
export class InfrastructureModule {}
