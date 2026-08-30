import { Inject, Injectable } from '@nestjs/common';
import type { Clock, IdGenerator, Logger, SourceProvider } from '@open-loops/kernel';
import type { ConnectionMode } from '@open-loops/integrations';
import type { ProbeRunner } from '@open-loops/loops';
import { LocalProbeRunner } from '@open-loops/connectors-local';
import { ComposioProbeRunner, type ComposioToolExplorer } from '@open-loops/connectors-composio';
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
import { SourceStackFactory } from './source-stack.factory.js';

/**
 * The singletons a workspace is assembled from. Grouped into one injected object because a
 * constructor taking nine of them separately is unreadable, and none of them are per-owner.
 * Anything that reaches an upstream account is deliberately not here: those come from
 * `SourceStackFactory`, which cannot hand one out without being told whose it is.
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
    @Inject(Tokens.ConnectionMode) public readonly mode: ConnectionMode,
    @Inject(Tokens.ConnectableProviders)
    public readonly connectableProviders: readonly SourceProvider[],
    @Inject(Tokens.LoopExtractor) public readonly extractor: LoopExtractor,
    @Inject(Tokens.LoopReconciler) public readonly reconciler: LoopReconciler,
    @Inject(Tokens.PodcastGenerator) public readonly generator: PodcastGenerator,
    @Inject(Tokens.AudioStore) public readonly audio: AudioStore,
  ) {}
}

/** Everything one person can do, already bound to that person. */
export interface Workspace {
  readonly ownerId: string;
  /** This account's window onto Composio's tools; undefined in local mode or without a key. */
  readonly explorer: ComposioToolExplorer | undefined;
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
    private readonly stacks: SourceStackFactory,
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

    // Sources, the OAuth broker and the tool explorer, all bound to this owner: two accounts
    // that both connected Slack are two Composio identities, not one shared connection.
    const stack = this.stacks.for(ownerId);

    // Local mode answers probes out of band, from this owner's own queue. Hosted mode asks
    // Composio as this owner. Neither can read another account's answer.
    const probeRunners: readonly ProbeRunner[] =
      stack.explorer === undefined
        ? [new LocalProbeRunner(probes)]
        : [new ComposioProbeRunner({ explorer: stack.explorer, logger })];

    const integrations = new ManageIntegrationsUseCase({
      integrations: integrationRepo,
      broker: stack.broker,
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
      connectors: stack.connectors,
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
      explorer: stack.explorer,
      episodes,
      probes,
      integrations,
      today,
      rebalance,
      ingest: new IngestSignalsUseCase({ signals, clock, logger }),
      commands: new LoopCommandsUseCase({ loops, plans, events, clock }),
      tick: new RunTickUseCase({ integrations, sync, extract, reconcile, rebalance, clock, logger }),
      podcast: new GenerateDailyPodcastUseCase({
        ownerId,
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
