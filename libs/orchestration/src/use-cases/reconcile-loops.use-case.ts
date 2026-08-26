import type { Clock, Instant, Logger } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type {
  Evidence,
  LoopEventPublisher,
  OpenLoop,
  OpenLoopId,
  OpenLoopRepository,
  OpenLoopView,
  ProbeRunner,
} from '@open-loops/loops';
import { EvidenceVerdict, LoopStatus } from '@open-loops/loops';
import type { Signal, SignalStore } from '@open-loops/signals';
import type { LoopReconciler, ReconciliationVerdict } from '../ports/reasoning.port.js';

export interface ReconcileLoopsDeps {
  readonly loops: OpenLoopRepository;
  readonly probeRunners: readonly ProbeRunner[];
  readonly reconciler: LoopReconciler;
  readonly signals: SignalStore;
  readonly events: LoopEventPublisher;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface ReconcileLoopsResult {
  readonly checked: number;
  readonly probesRun: number;
  readonly closed: number;
  readonly awaitingAcknowledgement: number;
}

const RECENT_WINDOW_MS = 12 * 60 * 60 * 1000;
const RECENT_SIGNAL_LIMIT = 80;
const MAX_LOOPS = 200;

/**
 * The hourly judgement pass, in two clearly separated halves. First the deterministic half:
 * run every probe and collect hard facts. Then the reasoning half: given those facts and the
 * last few hours of chatter, decide what changed and why. The model may add evidence and
 * re-score priority; it can never set a status, because status is a pure function of evidence.
 */
export class ReconcileLoopsUseCase {
  public constructor(private readonly deps: ReconcileLoopsDeps) {}

  public async execute(): Promise<ReconcileLoopsResult> {
    const now = this.deps.clock.now();
    const loops = await this.deps.loops.list({ actionableOnly: true, limit: MAX_LOOPS });
    if (loops.length === 0) {
      return { checked: 0, probesRun: 0, closed: 0, awaitingAcknowledgement: 0 };
    }

    const views = loops.map((loop) => loop.view(now));
    const probeEvidence = await this.runProbes({ views, now });
    const recentSignals = await this.deps.signals.listRecent({
      since: asInstant(now - RECENT_WINDOW_MS),
      limit: RECENT_SIGNAL_LIMIT,
    });
    const verdicts = await this.judge({ views, probeEvidence, recentSignals, now });
    const applied = await this.apply({ loops, probeEvidence, verdicts, now });

    this.deps.logger.info('reconciled loops', { checked: loops.length, ...applied });
    return {
      checked: loops.length,
      probesRun: [...probeEvidence.values()].flat().length,
      closed: applied.closed,
      awaitingAcknowledgement: applied.awaitingAcknowledgement,
    };
  }

  private async runProbes(input: {
    views: readonly OpenLoopView[];
    now: Instant;
  }): Promise<ReadonlyMap<OpenLoopId, readonly Evidence[]>> {
    const collected = new Map<OpenLoopId, Evidence[]>();
    for (const view of input.views) {
      const evidence: Evidence[] = [];
      for (const criterion of view.criteria) {
        const runner = this.deps.probeRunners.find((candidate) => candidate.canRun(criterion.probe));
        if (runner === undefined) continue;
        evidence.push(
          await this.runOne({
            runner,
            request: {
              loopId: view.id,
              criterionId: criterion.id,
              probe: criterion.probe,
              at: input.now,
            },
          }),
        );
      }
      if (evidence.length > 0) collected.set(view.id, evidence);
    }
    return collected;
  }

  private async runOne(input: {
    runner: ProbeRunner;
    request: Parameters<ProbeRunner['run']>[0];
  }): Promise<Evidence> {
    try {
      return await input.runner.run(input.request);
    } catch (error) {
      return {
        criterionId: input.request.criterionId,
        verdict: EvidenceVerdict.Inconclusive,
        observedAt: input.request.at,
        summary: error instanceof Error ? error.message : 'probe failed',
      };
    }
  }

  private async judge(input: {
    views: readonly OpenLoopView[];
    probeEvidence: ReadonlyMap<OpenLoopId, readonly Evidence[]>;
    recentSignals: readonly Signal[];
    now: Instant;
  }): Promise<readonly ReconciliationVerdict[]> {
    try {
      return await this.deps.reconciler.reconcile({
        loops: input.views,
        probeEvidence: [...input.probeEvidence.values()].flat(),
        recentSignals: input.recentSignals,
        now: input.now,
      });
    } catch (error) {
      this.deps.logger.warn('reconciler unavailable; falling back to probes only', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async apply(input: {
    loops: readonly OpenLoop[];
    probeEvidence: ReadonlyMap<OpenLoopId, readonly Evidence[]>;
    verdicts: readonly ReconciliationVerdict[];
    now: Instant;
  }): Promise<{ closed: number; awaitingAcknowledgement: number }> {
    const byLoopId = new Map(input.verdicts.map((verdict) => [verdict.loopId, verdict]));
    let closed = 0;
    let awaitingAcknowledgement = 0;

    for (const loop of input.loops) {
      const verdict = byLoopId.get(loop.id);
      const observations = [
        ...(input.probeEvidence.get(loop.id) ?? []),
        ...(verdict?.evidence ?? []),
      ];
      if (verdict?.revisedCriteria !== undefined) {
        loop.reviseCriteria({ criteria: verdict.revisedCriteria, at: input.now });
      }
      if (verdict?.suggestedPriority !== undefined) {
        loop.reprioritise({ priority: verdict.suggestedPriority, at: input.now });
      }
      if (observations.length > 0) loop.recordEvidence({ observations, at: input.now });
      else loop.markChecked(input.now);

      const status = loop.view(input.now).status;
      if (status === LoopStatus.Done) closed += 1;
      if (status === LoopStatus.DoneUnconfirmed) awaitingAcknowledgement += 1;

      await this.deps.loops.save(loop);
      await this.deps.events.publish(loop.pullEvents());
    }

    return { closed, awaitingAcknowledgement };
  }
}
