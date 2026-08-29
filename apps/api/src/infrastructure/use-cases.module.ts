import { Global, Module, type Provider } from '@nestjs/common';
import type { Clock, IdGenerator, Logger, SourceProvider } from '@open-loops/kernel';
import type { ConnectionBroker, ConnectionMode, IntegrationRepository } from '@open-loops/integrations';
import type { LoopEventPublisher, OpenLoopRepository, ProbeRunner } from '@open-loops/loops';
import type { BusyTimeProvider, DailyPlanRepository } from '@open-loops/planning';
import type { SignalStore, SourceConnector, SyncCursorStore } from '@open-loops/signals';
import type { AudioStore, EpisodeRepository, PodcastGenerator } from '@open-loops/podcast';
import type { LoopExtractor, LoopReconciler } from '@open-loops/orchestration';
import {
  ExtractLoopsUseCase,
  GenerateDailyPodcastUseCase,
  IngestSignalsUseCase,
  LoopCommandsUseCase,
  ManageIntegrationsUseCase,
  RebalanceDayUseCase,
  ReconcileLoopsUseCase,
  RunTickUseCase,
  SyncSourcesUseCase,
  TodayViewQuery,
} from '@open-loops/orchestration';
import type { AppConfig } from '../config/env.js';
import { Tokens } from '../tokens.js';

/**
 * Use cases are assembled from ports here rather than being decorated as Nest services. That
 * keeps the orchestration library framework-free — the same objects can be driven by a CLI, a
 * cron worker or a future MCP server without importing Nest.
 */
const providers: Provider[] = [
  {
    provide: Tokens.SyncSources,
    inject: [
      Tokens.IntegrationRepository,
      Tokens.SyncCursorStore,
      Tokens.SignalStore,
      Tokens.SourceConnectors,
      Tokens.Clock,
      Tokens.Logger,
    ],
    useFactory: (
      integrations: IntegrationRepository,
      cursors: SyncCursorStore,
      signals: SignalStore,
      connectors: readonly SourceConnector[],
      clock: Clock,
      logger: Logger,
    ) => new SyncSourcesUseCase({ integrations, cursors, signals, connectors, clock, logger }),
  },
  {
    provide: Tokens.ExtractLoops,
    inject: [
      Tokens.SignalStore,
      Tokens.LoopRepository,
      Tokens.LoopExtractor,
      Tokens.Ids,
      Tokens.Clock,
      Tokens.Logger,
    ],
    useFactory: (
      signals: SignalStore,
      loops: OpenLoopRepository,
      extractor: LoopExtractor,
      ids: IdGenerator,
      clock: Clock,
      logger: Logger,
    ) => new ExtractLoopsUseCase({ signals, loops, extractor, ids, clock, logger }),
  },
  {
    provide: Tokens.ReconcileLoops,
    inject: [
      Tokens.LoopRepository,
      Tokens.ProbeRunners,
      Tokens.LoopReconciler,
      Tokens.SignalStore,
      Tokens.EventPublisher,
      Tokens.Clock,
      Tokens.Logger,
    ],
    useFactory: (
      loops: OpenLoopRepository,
      probeRunners: readonly ProbeRunner[],
      reconciler: LoopReconciler,
      signals: SignalStore,
      events: LoopEventPublisher,
      clock: Clock,
      logger: Logger,
    ) =>
      new ReconcileLoopsUseCase({
        loops,
        probeRunners,
        reconciler,
        signals,
        events,
        clock,
        logger,
      }),
  },
  {
    provide: Tokens.RebalanceDay,
    inject: [
      Tokens.LoopRepository,
      Tokens.PlanRepository,
      Tokens.BusyTimeProvider,
      Tokens.Ids,
      Tokens.Clock,
      Tokens.Logger,
    ],
    useFactory: (
      loops: OpenLoopRepository,
      plans: DailyPlanRepository,
      busyTime: BusyTimeProvider,
      ids: IdGenerator,
      clock: Clock,
      logger: Logger,
    ) => new RebalanceDayUseCase({ loops, plans, busyTime, ids, clock, logger }),
  },
  {
    provide: Tokens.RunTick,
    inject: [
      Tokens.ManageIntegrations,
      Tokens.SyncSources,
      Tokens.ExtractLoops,
      Tokens.ReconcileLoops,
      Tokens.RebalanceDay,
      Tokens.Clock,
      Tokens.Logger,
    ],
    useFactory: (
      integrations: ManageIntegrationsUseCase,
      sync: SyncSourcesUseCase,
      extract: ExtractLoopsUseCase,
      reconcile: ReconcileLoopsUseCase,
      rebalance: RebalanceDayUseCase,
      clock: Clock,
      logger: Logger,
    ) => new RunTickUseCase({ integrations, sync, extract, reconcile, rebalance, clock, logger }),
  },
  {
    provide: Tokens.IngestSignals,
    inject: [Tokens.SignalStore, Tokens.Clock, Tokens.Logger],
    useFactory: (signals: SignalStore, clock: Clock, logger: Logger) =>
      new IngestSignalsUseCase({ signals, clock, logger }),
  },
  {
    provide: Tokens.ManageIntegrations,
    inject: [
      Tokens.IntegrationRepository,
      Tokens.ConnectionBroker,
      Tokens.ConnectionMode,
      Tokens.ConnectableProviders,
      Tokens.Ids,
      Tokens.Clock,
      Tokens.Logger,
    ],
    useFactory: (
      integrations: IntegrationRepository,
      broker: ConnectionBroker,
      mode: ConnectionMode,
      connectableProviders: readonly SourceProvider[],
      ids: IdGenerator,
      clock: Clock,
      logger: Logger,
    ) =>
      new ManageIntegrationsUseCase({
        integrations,
        broker,
        mode,
        connectableProviders,
        ids,
        clock,
        logger,
      }),
  },
  {
    provide: Tokens.LoopCommands,
    inject: [Tokens.LoopRepository, Tokens.PlanRepository, Tokens.EventPublisher, Tokens.Clock],
    useFactory: (
      loops: OpenLoopRepository,
      plans: DailyPlanRepository,
      events: LoopEventPublisher,
      clock: Clock,
    ) => new LoopCommandsUseCase({ loops, plans, events, clock }),
  },
  {
    provide: Tokens.TodayView,
    inject: [Tokens.LoopRepository, Tokens.PlanRepository, Tokens.Clock, Tokens.Config],
    useFactory: (
      loops: OpenLoopRepository,
      plans: DailyPlanRepository,
      clock: Clock,
      config: AppConfig,
    ) => new TodayViewQuery({ loops, plans, clock, timeZone: config.OPEN_LOOPS_TIMEZONE }),
  },
  {
    provide: Tokens.GenerateDailyPodcast,
    inject: [
      Tokens.TodayView,
      Tokens.EpisodeRepository,
      Tokens.PodcastGenerator,
      Tokens.AudioStore,
      Tokens.Clock,
      Tokens.Ids,
      Tokens.Logger,
    ],
    useFactory: (
      today: TodayViewQuery,
      episodes: EpisodeRepository,
      generator: PodcastGenerator,
      audio: AudioStore,
      clock: Clock,
      ids: IdGenerator,
      logger: Logger,
    ) => new GenerateDailyPodcastUseCase({ today, episodes, generator, audio, clock, ids, logger }),
  },
];

@Global()
@Module({
  providers,
  exports: providers.map((provider) => (provider as { provide: string }).provide),
})
export class UseCasesModule {}
