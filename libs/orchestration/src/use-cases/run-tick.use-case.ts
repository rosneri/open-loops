import type { Clock, Instant, Logger } from '@open-loops/kernel';
import type { TickFailureDto, TickReportDto } from '@open-loops/contracts';
import type { ExtractLoopsResult, ExtractLoopsUseCase } from './extract-loops.use-case.js';
import type { RebalanceDayResult, RebalanceDayUseCase } from './rebalance-day.use-case.js';
import type { ReconcileLoopsResult, ReconcileLoopsUseCase } from './reconcile-loops.use-case.js';
import type { SyncSourcesResult, SyncSourcesUseCase } from './sync-sources.use-case.js';
import type { ManageIntegrationsUseCase } from './manage-integrations.use-case.js';
import type { TickStep, TickStepReport } from '../ports/tick-step.port.js';

export interface RunTickDeps {
  readonly integrations: ManageIntegrationsUseCase;
  readonly sync: SyncSourcesUseCase;
  readonly extract: ExtractLoopsUseCase;
  readonly reconcile: ReconcileLoopsUseCase;
  readonly rebalance: RebalanceDayUseCase;
  /**
   * What the installed plugins added, already in dependency order. They run after the product's
   * own four steps and never instead of them: sync, extract, reconcile and re-plan *are* the
   * heartbeat, and a plugin that could remove one of them could quietly stop the app from being
   * honest about what is open.
   */
  readonly steps: readonly TickStep[];
  readonly ownerId: string;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * One heartbeat of the product: pull, understand, verify, re-plan. Running it hourly is what
 * turns a static list into something that keeps itself honest.
 */
export class RunTickUseCase {
  public constructor(private readonly deps: RunTickDeps) {}

  public async execute(): Promise<TickReportDto> {
    const startedAt = this.deps.clock.now();
    this.deps.logger.info('tick started');

    const failures: TickFailureDto[] = [];
    // Cheap, and it means connecting an app is the only step a user ever has to take.
    await this.step('adopt', failures, async () => await this.deps.integrations.adoptUpstream());

    const sync = await this.deps.sync.execute();
    failures.push(...sync.failures);

    const extract = await this.step('extract', failures, async () => await this.deps.extract.execute());
    const reconcile = await this.step('reconcile', failures, async () => await this.deps.reconcile.execute());
    const plan = await this.step('plan', failures, async () => await this.deps.rebalance.execute());
    const extra = await this.runPlugins(failures);

    const report = toReport({
      window: { startedAt, finishedAt: this.deps.clock.now() },
      steps: { sync, extract, reconcile, plan },
      extra,
      failures,
    });
    this.deps.logger.info('tick finished', { ...report });
    return report;
  }

  /**
   * Each plugin step is isolated exactly like a core one. A podcast that cannot reach its voice
   * API must not lose the loops the tick already closed.
   */
  private async runPlugins(
    failures: TickFailureDto[],
  ): Promise<Record<string, TickStepReport>> {
    const collected: Record<string, TickStepReport> = {};
    for (const step of this.deps.steps) {
      const counted = await this.step(step.name, failures, async () =>
        await step.run({
          ownerId: this.deps.ownerId,
          clock: this.deps.clock,
          logger: this.deps.logger,
        }),
      );
      if (counted !== undefined) collected[step.name] = counted;
    }
    return collected;
  }

  /**
   * A step that throws must not discard the work the earlier steps already committed. Signals
   * fetched before a missing API key are still in the store, so the next tick picks up exactly
   * where this one stopped instead of re-fetching.
   */
  private async step<TResult>(
    name: string,
    failures: TickFailureDto[],
    work: () => Promise<TResult>,
  ): Promise<TResult | undefined> {
    try {
      return await work();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ source: name, error: message });
      this.deps.logger.error('tick step failed', { step: name, error: message });
      return undefined;
    }
  }
}

interface StepResults {
  readonly sync: SyncSourcesResult;
  readonly extract: ExtractLoopsResult | undefined;
  readonly reconcile: ReconcileLoopsResult | undefined;
  readonly plan: RebalanceDayResult | undefined;
}

/** A skipped step contributes zeros rather than absent fields, so the report is always total. */
const SKIPPED = {
  extract: { signalsRead: 0, loopsCreated: 0, loopsSkipped: 0 },
  reconcile: { checked: 0, probesRun: 0, closed: 0, awaitingAcknowledgement: 0 },
  plan: { blocks: [], deferred: 0 },
} as const;

const toReport = (input: {
  window: { startedAt: Instant; finishedAt: Instant };
  steps: StepResults;
  extra: Readonly<Record<string, TickStepReport>>;
  failures: readonly TickFailureDto[];
}): TickReportDto => {
  const extract = input.steps.extract ?? SKIPPED.extract;
  const reconcile = input.steps.reconcile ?? SKIPPED.reconcile;
  const plan = input.steps.plan ?? SKIPPED.plan;

  return {
    startedAt: input.window.startedAt,
    finishedAt: input.window.finishedAt,
    signalsFetched: input.steps.sync.fetched,
    loopsCreated: extract.loopsCreated,
    loopsChecked: reconcile.checked,
    loopsClosed: reconcile.closed,
    awaitingAcknowledgement: reconcile.awaitingAcknowledgement,
    blocksPlanned: plan.blocks.length,
    deferred: plan.deferred,
    ...(Object.keys(input.extra).length === 0 ? {} : { steps: input.extra }),
    failures: input.failures,
  };
};
