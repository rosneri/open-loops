import { Inject, Injectable } from '@nestjs/common';
import type { Clock, IdGenerator, Logger, SourceProvider } from '@open-loops/kernel';
import type { ConnectionBroker, ConnectionMode } from '@open-loops/integrations';
import type { ProbeRunner } from '@open-loops/loops';
import { LocalProbeRunner } from '@open-loops/connectors-local';
import { ComposioProbeRunner, type ComposioToolExplorer } from '@open-loops/connectors-composio';
import type { SourceConnector } from '@open-loops/signals';
import type { AudioStore, PodcastGenerator } from '@open-loops/podcast';
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
import {
  PrismaDailyPlanRepository,
  PrismaEpisodeRepository,
  PrismaIntegrationRepository,
  PrismaLoopEventPublisher,
  PrismaOpenLoopRepository,
  PrismaProbeTaskStore,
  PrismaSignalStore,
  PrismaSyncCursorStore,
  SignalBusyTimeProvider,
  type PrismaClient,
} from '@open-loops/persistence';
import type { AppConfig } from '../config/env.js';
import { Tokens } from '../tokens.js';

/**
 * The singletons a workspace is assembled from. Grouped into one injected object because a
 * constructor taking eleven of them separately is unreadable, and none of them are per-owner.
 *
 * Declared before the factory that injects it: Nest reads constructor types from decorator
 * metadata at class-definition time, so a forward reference here is a runtime error rather than
 * a matter of taste.
 */
@Injectable()
export class SharedServices {
  public constructor(
    @Inject(Tokens.Clock) public readonly clock: Clock,
    @Inject(Tokens.Ids) public readonly ids: IdGenerator,
    @Inject(Tokens.Logger) public readonly logger: Logger,
    @Inject(Tokens.SourceConnectors) public readonly connectors: readonly SourceConnector[],
    @Inject(Tokens.ConnectionBroker) public readonly broker: ConnectionBroker,
    @Inject(Tokens.ConnectionMode) public readonly mode: ConnectionMode,
    @Inject(Tokens.ConnectableProviders)
    public readonly connectableProviders: readonly SourceProvider[],
    @Inject(Tokens.ToolExplorer) public readonly explorer: ComposioToolExplorer | undefined,
    @Inject(Tokens.LoopExtractor) public readonly extractor: LoopExtractor,
    @Inject(Tokens.LoopReconciler) public readonly reconciler: LoopReconciler,
    @Inject(Tokens.PodcastGenerator) public readonly generator: PodcastGenerator,
    @Inject(Tokens.AudioStore) public readonly audio: AudioStore,
  ) {}
}

/** Everything one person can do, already bound to that person. */
export interface Workspace {
  readonly ownerId: string;
  readonly tick: RunTickUseCase;
  readonly today: TodayViewQuery;
  readonly commands: LoopCommandsUseCase;
  readonly rebalance: RebalanceDayUseCase;
  readonly integrations: ManageIntegrationsUseCase;
  readonly ingest: IngestSignalsUseCase;
  readonly podcast: GenerateDailyPodcastUseCase;
  readonly probes: PrismaProbeTaskStore;
  readonly episodes: PrismaEpisodeRepository;
  readonly loops: PrismaOpenLoopRepository;
}

/**
 * Tenancy is enforced by construction rather than by remembering to filter. Repositories are
 * built for one owner and cannot express a question about anyone else, so no use case, query or
 * controller below this line has to know that other people exist — and none of them changed
 * when they started to.
 *
 * The cost is a handful of small objects per request. They hold no connections: the Prisma
 * client, the connectors and the model are singletons injected here and shared.
 */
@Injectable()
export class WorkspaceFactory {
  public constructor(
    @Inject(Tokens.Prisma) private readonly prisma: PrismaClient,
    @Inject(Tokens.Config) private readonly config: AppConfig,
    private readonly shared: SharedServices,
  ) {}

  public for(ownerId: string): Workspace {
    const loops = new PrismaOpenLoopRepository(this.prisma, ownerId);
    const plans = new PrismaDailyPlanRepository(this.prisma, ownerId);
    const integrationRepo = new PrismaIntegrationRepository(this.prisma, ownerId);
    const signals = new PrismaSignalStore(this.prisma, ownerId);
    const cursors = new PrismaSyncCursorStore(this.prisma, ownerId);
    const busyTime = new SignalBusyTimeProvider(this.prisma, ownerId);
    const episodes = new PrismaEpisodeRepository(this.prisma, ownerId);
    const events = new PrismaLoopEventPublisher(this.prisma);
    const probes = new PrismaProbeTaskStore({
      prisma: this.prisma,
      logger: this.shared.logger,
      ownerId,
    });

    const { clock, ids, logger } = this.shared;

    // In local mode the probe runner reads from this owner's queue, so it cannot be a singleton
    // the way the hosted one can. Building it here is what keeps the queue per person.
    const probeRunners: readonly ProbeRunner[] =
      this.shared.explorer === undefined || this.config.OPEN_LOOPS_MODE === 'LOCAL'
        ? [new LocalProbeRunner(probes)]
        : [new ComposioProbeRunner({ explorer: this.shared.explorer, logger })];

    const integrations = new ManageIntegrationsUseCase({
      integrations: integrationRepo,
      broker: this.shared.broker,
      mode: this.shared.mode,
      connectableProviders: this.shared.connectableProviders,
      ids,
      clock,
      logger,
    });
    const sync = new SyncSourcesUseCase({
      integrations: integrationRepo,
      cursors,
      signals,
      connectors: this.shared.connectors,
      clock,
      logger,
    });
    const extract = new ExtractLoopsUseCase({
      signals,
      loops,
      extractor: this.shared.extractor,
      ids,
      clock,
      logger,
    });
    const reconcile = new ReconcileLoopsUseCase({
      loops,
      probeRunners,
      reconciler: this.shared.reconciler,
      signals,
      events,
      clock,
      logger,
    });
    const rebalance = new RebalanceDayUseCase({ loops, plans, busyTime, ids, clock, logger });
    const today = new TodayViewQuery({
      loops,
      plans,
      clock,
      timeZone: this.config.OPEN_LOOPS_TIMEZONE,
    });

    return {
      ownerId,
      loops,
      episodes,
      probes,
      integrations,
      today,
      rebalance,
      ingest: new IngestSignalsUseCase({ signals, clock, logger }),
      commands: new LoopCommandsUseCase({ loops, plans, events, clock }),
      tick: new RunTickUseCase({ integrations, sync, extract, reconcile, rebalance, clock, logger }),
      podcast: new GenerateDailyPodcastUseCase({
        today,
        episodes,
        generator: this.shared.generator,
        audio: this.shared.audio,
        clock,
        ids,
        logger,
      }),
    };
  }
}
