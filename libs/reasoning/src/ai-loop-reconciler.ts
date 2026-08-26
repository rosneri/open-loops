import type { Instant, Logger } from '@open-loops/kernel';
import type { Evidence, OpenLoopView } from '@open-loops/loops';
import { asCriterionId } from '@open-loops/loops';
import type { LoopReconciler, ReconciliationVerdict } from '@open-loops/orchestration';
import type { Signal } from '@open-loops/signals';
import { generateObject } from 'ai';
import type { ModelProvider } from './model-registry.js';
import { RECONCILER_SYSTEM, describeNow } from './prompts.js';
import { reconciliationResultSchema } from './schemas.js';

export interface AiLoopReconcilerDeps {
  readonly model: ModelProvider;
  readonly logger: Logger;
}

const MAX_LOOPS_PER_CALL = 20;
const MAX_SIGNALS = 60;

/**
 * Step two of the agent. It sees the probes' hard verdicts first and the raw chatter second,
 * and may only speak in per-criterion verdicts. Whether a loop is done is still decided by
 * `assessCompletion` in the domain, from evidence alone.
 */
export class AiLoopReconciler implements LoopReconciler {
  public constructor(private readonly deps: AiLoopReconcilerDeps) {}

  public async reconcile(input: {
    loops: readonly OpenLoopView[];
    probeEvidence: readonly Evidence[];
    recentSignals: readonly Signal[];
    now: Instant;
  }): Promise<readonly ReconciliationVerdict[]> {
    const verdicts: ReconciliationVerdict[] = [];
    for (const batch of chunk(input.loops, MAX_LOOPS_PER_CALL)) {
      verdicts.push(...(await this.judge({ ...input, loops: batch })));
    }
    return verdicts;
  }

  private async judge(input: {
    loops: readonly OpenLoopView[];
    probeEvidence: readonly Evidence[];
    recentSignals: readonly Signal[];
    now: Instant;
  }): Promise<readonly ReconciliationVerdict[]> {
    const { object } = await generateObject({
      model: this.deps.model(),
      schema: reconciliationResultSchema,
      system: RECONCILER_SYSTEM,
      prompt: [
        describeNow(input.now),
        '\n## Open loops\n',
        renderLoops(input.loops, input.probeEvidence),
        '\n## Recent signals\n',
        renderSignals(input.recentSignals),
      ].join('\n'),
      temperature: 0,
    });

    this.deps.logger.debug('reconciler returned verdicts', { count: object.verdicts.length });
    return object.verdicts.map((verdict) => ({
      loopId: verdict.loopId,
      rationale: verdict.rationale,
      ...(verdict.suggestedPriority === undefined
        ? {}
        : { suggestedPriority: verdict.suggestedPriority }),
      evidence: verdict.criterionVerdicts.map(
        (item): Evidence => ({
          criterionId: asCriterionId(item.criterionId),
          verdict: item.verdict,
          observedAt: input.now,
          summary: item.summary,
          ...(item.url === undefined ? {} : { url: item.url }),
        }),
      ),
    }));
  }
}

const renderLoops = (
  loops: readonly OpenLoopView[],
  probeEvidence: readonly Evidence[],
): string => {
  const byCriterion = new Map(probeEvidence.map((item) => [item.criterionId, item]));
  return loops
    .map((loop) =>
      [
        `loopId: ${loop.id}`,
        `kind: ${loop.kind} | status: ${loop.status}`,
        `title: ${loop.title}`,
        `summary: ${loop.summary}`,
        `source: ${loop.source.provider} ${loop.source.url ?? loop.source.externalId}`,
        'criteria:',
        ...loop.criteria.map((criterion) => {
          const probe = byCriterion.get(criterion.id);
          const seen =
            probe === undefined ? 'no probe run' : `probe ${probe.verdict}: ${probe.summary}`;
          return `  - ${criterion.id} [${criterion.role}] ${criterion.probe.describedAs} -> ${seen}`;
        }),
      ].join('\n'),
    )
    .join('\n---\n');
};

const renderSignals = (signals: readonly Signal[]): string =>
  signals
    .slice(0, MAX_SIGNALS)
    .map(
      (signal) =>
        `${new Date(signal.occurredAt).toISOString()} ${signal.provider} ` +
        `${signal.author.displayName}${signal.author.isMe ? ' [user]' : ''}: ` +
        `${signal.title} — ${signal.body.slice(0, 400)}`,
    )
    .join('\n');

const chunk = <TItem>(items: readonly TItem[], size: number): readonly (readonly TItem[])[] => {
  const batches: TItem[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};
