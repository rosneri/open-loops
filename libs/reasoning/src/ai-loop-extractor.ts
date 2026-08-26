import type { Instant, Logger } from '@open-loops/kernel';
import { asInstant, asMinutes } from '@open-loops/kernel';
import type { Party } from '@open-loops/loops';
import { CriterionRole } from '@open-loops/loops';
import type { ExtractedLoop, LoopExtractor } from '@open-loops/orchestration';
import type { Signal } from '@open-loops/signals';
import { Output, generateText } from 'ai';
import type { ModelProvider } from './model-registry.js';
import { EXTRACTOR_SYSTEM, describeNow } from './prompts.js';
import { toProbe } from './probe-mapper.js';
import type { ExtractedLoopDraft } from './schemas.js';
import { extractionResultSchema } from './schemas.js';

export interface AiLoopExtractorDeps {
  readonly model: ModelProvider;
  readonly logger: Logger;
}

const MAX_BODY = 1200;

/**
 * Step one of the agent. Note what it is *not* allowed to do: it proposes candidate loops and
 * the criteria that would prove them done, and nothing else. It cannot mark anything complete,
 * and the use case discards any loop whose source id was not among the signals it was handed.
 */
export class AiLoopExtractor implements LoopExtractor {
  public constructor(private readonly deps: AiLoopExtractorDeps) {}

  public async extract(input: {
    signals: readonly Signal[];
    now: Instant;
  }): Promise<readonly ExtractedLoop[]> {
    if (input.signals.length === 0) return [];

    const { output } = await generateText({
      model: this.deps.model(),
      output: Output.object({ schema: extractionResultSchema, name: 'open_loops' }),
      system: EXTRACTOR_SYSTEM,
      prompt: `${describeNow(input.now)}\n\nSignals:\n${render(input.signals)}`,
      temperature: 0.1,
    });

    this.deps.logger.info('extractor produced candidates', { count: output.loops.length });
    return output.loops.map((draft) => toExtracted({ draft, now: input.now }));
  }
}

const render = (signals: readonly Signal[]): string =>
  signals
    .map((signal) =>
      [
        `id: ${signal.externalId}`,
        `provider: ${signal.provider} (${signal.kind})`,
        `from: ${signal.author.displayName}${signal.author.isMe ? ' [this is the user]' : ''}`,
        `at: ${new Date(signal.occurredAt).toISOString()}`,
        signal.channel === undefined ? undefined : `channel: ${signal.channel}`,
        signal.threadRef === undefined ? undefined : `thread: ${signal.threadRef}`,
        `title: ${signal.title}`,
        `body: ${signal.body.slice(0, MAX_BODY)}`,
      ]
        .filter((line) => line !== undefined)
        .join('\n'),
    )
    .join('\n---\n');

const toParty = (draft: ExtractedLoopDraft): Party | undefined => {
  if (draft.counterpartyName === undefined && draft.counterpartyHandle === undefined) {
    return undefined;
  }
  return {
    displayName: draft.counterpartyName ?? draft.counterpartyHandle ?? 'unknown',
    ...(draft.counterpartyHandle === undefined ? {} : { handle: draft.counterpartyHandle }),
    ...(draft.counterpartyImportance === undefined
      ? {}
      : { importance: draft.counterpartyImportance }),
  };
};

const toExtracted = (input: { draft: ExtractedLoopDraft; now: Instant }): ExtractedLoop => {
  const { draft, now } = input;
  const counterparty = toParty(draft);
  const dueAt = draft.dueAtIso === undefined ? Number.NaN : Date.parse(draft.dueAtIso);
  return {
    sourceExternalId: draft.sourceExternalId,
    kind: draft.kind,
    title: draft.title,
    summary: draft.summary,
    ...(counterparty === undefined ? {} : { counterparty }),
    criteria: draft.criteria.map((criterion) => ({
      role:
        criterion.role === 'ACKNOWLEDGEMENT'
          ? CriterionRole.Acknowledgement
          : CriterionRole.Deliverable,
      optional: criterion.optional,
      probe: toProbe({ draft: criterion.probe, now }),
    })),
    ...(Number.isNaN(dueAt) ? {} : { dueAt: asInstant(dueAt) }),
    estimate: asMinutes(draft.estimateMinutes),
    priority: draft.priority,
    confidence: draft.confidence,
  };
};
