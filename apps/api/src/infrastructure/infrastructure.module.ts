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
import type { StructuredGenerator } from '@open-loops/orchestration';
import { ModelLoopExtractor, ModelLoopReconciler } from '@open-loops/reasoning';
import { PluginHost, ProbeCatalog, ScheduleCatalog, SourceCatalog } from '@open-loops/plugin-host';
import type { AppConfig } from '../config/env.js';
import type { BuiltInSchedules } from '../modules/settings/built-in-schedules.js';
import { builtInSchedules } from '../modules/settings/built-in-schedules.js';
import type { SettingsStores } from '../modules/settings/settings.service.js';
import { PluginSettingsStore } from '../modules/settings/plugin-settings.store.js';
import { aiProvider, isLocalMode, loadConfig } from '../config/env.js';
import { generatorFor } from './reasoning.js';
import { AccountIdentities } from './account-identity.service.js';
import { SourceStackFactory } from './source-stack.factory.js';
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
    inject: [Tokens.SettingsRepository, Tokens.ScheduleRepository, Tokens.PluginHost, Tokens.Prisma],
    useFactory: (
      settings: PrismaSettingsRepository,
      schedules: PrismaScheduleRepository,
      host: PluginHost,
      prisma: PrismaClient,
    ): SettingsStores => ({ settings, schedules, plugins: new PluginSettingsStore({ host, prisma }) }),
  },
  {
    provide: Tokens.BuiltInSchedules,
    inject: [Tokens.Config],
    useFactory: (config: AppConfig): BuiltInSchedules => builtInSchedules({ config }),
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
  {
    /**
     * The sources that named no toolkit, and so have nothing to authorise anywhere: they arrive
     * by push. Read from the catalogue rather than from the mode, because whether Wispr Flow has
     * a hosted API is not a fact about this deployment.
     */
    provide: Tokens.PushProviders,
    inject: [Tokens.SourceCatalog],
    useFactory: (sources: SourceCatalog): readonly SourceProvider[] => {
      const brokered = new Set(sources.connectable());
      return sources.providers().filter((provider) => !brokered.has(provider));
    },
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
    inject: [Tokens.Config, Tokens.Logger, Tokens.PluginHost],
    useFactory: (config: AppConfig, logger: Logger, host: PluginHost): StructuredGenerator =>
      generatorFor({ host, preferred: aiProvider(config), model: config.AI_MODEL, logger }),
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


const ALL = [
  ...base,
  ...persistence,
  ...plugins,
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
