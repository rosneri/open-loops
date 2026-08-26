import type { Clock, Logger } from '@open-loops/kernel';
import type { TickReportDto } from '@open-loops/contracts';
import type { ExtractLoopsUseCase } from './extract-loops.use-case.js';
import type { RebalanceDayUseCase } from './rebalance-day.use-case.js';
import type { ReconcileLoopsUseCase } from './reconcile-loops.use-case.js';
import type { SyncSourcesUseCase } from './sync-sources.use-case.js';

export interface RunTickDeps {
  readonly sync: SyncSourcesUseCase;
  readonly extract: ExtractLoopsUseCase;
  readonly reconcile: ReconcileLoopsUseCase;
  readonly rebalance: RebalanceDayUseCase;
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

    const sync = await this.deps.sync.execute();
    const extract = await this.deps.extract.execute();
    const reconcile = await this.deps.reconcile.execute();
    const plan = await this.deps.rebalance.execute();

    const report: TickReportDto = {
      startedAt,
      finishedAt: this.deps.clock.now(),
      signalsFetched: sync.fetched,
      loopsCreated: extract.loopsCreated,
      loopsChecked: reconcile.checked,
      loopsClosed: reconcile.closed,
      awaitingAcknowledgement: reconcile.awaitingAcknowledgement,
      blocksPlanned: plan.blocks.length,
      deferred: plan.deferred,
      failures: sync.failures,
    };
    this.deps.logger.info('tick finished', { ...report });
    return report;
  }
}
