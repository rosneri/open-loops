import type { Clock, IdGenerator, Instant, Logger } from '@open-loops/kernel';
import type { OpenLoopProps, OpenLoopRepository } from '@open-loops/loops';
import { OpenLoop, asCriterionId, asOpenLoopId, sourceKey } from '@open-loops/loops';
import type { Signal, SignalStore } from '@open-loops/signals';
import { signalKey } from '@open-loops/signals';
import type { ExtractedLoop, LoopExtractor } from '../ports/reasoning.port.js';

export interface ExtractLoopsDeps {
  readonly signals: SignalStore;
  readonly loops: OpenLoopRepository;
  readonly extractor: LoopExtractor;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** One thing a step actually did, so a count can be opened up instead of taken on trust. */
export interface LoopEntry {
  readonly loopId: string;
  readonly title: string;
  readonly provider: string;
  readonly externalId: string;
}

export interface ExtractLoopsResult {
  readonly signalsRead: number;
  readonly loopsCreated: number;
  readonly loopsSkipped: number;
  /** Loops whose wording caught up with a signal that had been re-read and had changed. */
  readonly loopsRestated: number;
  readonly created: readonly LoopEntry[];
  readonly restated: readonly LoopEntry[];
  /** Why something was passed over: the answer people actually want from a "skipped" count. */
  readonly skippedReasons: readonly { readonly sourceExternalId: string; readonly reason: string }[];
}

const BATCH_SIZE = 120;
const MIN_CONFIDENCE = 0.45;

/**
 * The first reasoning step. The model proposes obligations; this use case decides what is worth
 * keeping, assigns identity, and refuses anything it cannot trace back to a signal it actually
 * handed over — so a hallucinated source id produces nothing at all.
 */
export class ExtractLoopsUseCase {
  public constructor(private readonly deps: ExtractLoopsDeps) {}

  public async execute(): Promise<ExtractLoopsResult> {
    const now = this.deps.clock.now();
    const batch = await this.deps.signals.listUnprocessed(BATCH_SIZE);
    if (batch.length === 0) {
      return {
        signalsRead: 0,
        loopsCreated: 0,
        loopsSkipped: 0,
        loopsRestated: 0,
        created: [],
        restated: [],
        skippedReasons: [],
      };
    }

    const proposals = await this.deps.extractor.extract({ signals: batch, now });
    const byId = new Map(batch.map((signal) => [signal.externalId, signal]));
    const created: OpenLoop[] = [];
    const restated: OpenLoop[] = [];
    const skippedReasons: { sourceExternalId: string; reason: string }[] = [];
    let skipped = 0;

    for (const proposal of proposals) {
      const signal = byId.get(proposal.sourceExternalId);
      if (signal === undefined || proposal.confidence < MIN_CONFIDENCE) {
        skipped += 1;
        skippedReasons.push({
          sourceExternalId: proposal.sourceExternalId,
          reason:
            signal === undefined
              ? 'the model named a signal that was not in the batch'
              : `confidence ${proposal.confidence.toFixed(2)} is below ${String(MIN_CONFIDENCE)}`,
        });
        continue;
      }
      const existing = await this.deps.loops.findBySourceKey(signalKey(signal));
      if (existing !== undefined) {
        // Seen before, and the signal has been re-read since — otherwise it would not be back in
        // an unprocessed batch. Let the wording catch up rather than keeping the first guess
        // forever; everything the loop has since accumulated survives.
        if (
          existing.restate({
            title: proposal.title,
            summary: proposal.summary,
            ...(proposal.counterparty === undefined
              ? {}
              : { counterparty: proposal.counterparty }),
            at: now,
          })
        ) {
          restated.push(existing);
        } else {
          skipped += 1;
          skippedReasons.push({
            sourceExternalId: proposal.sourceExternalId,
            reason: 'already a loop, and nothing about it changed',
          });
        }
        continue;
      }
      created.push(OpenLoop.create(this.toProps({ proposal, signal, now })));
    }

    await this.deps.loops.saveMany([...created, ...restated]);
    await this.deps.signals.markProcessed(batch.map(signalKey));
    this.deps.logger.info('extracted loops', {
      created: created.length,
      restated: restated.length,
      skipped,
    });

    return {
      signalsRead: batch.length,
      loopsCreated: created.length,
      loopsSkipped: skipped,
      loopsRestated: restated.length,
      created: created.map(entryOf),
      restated: restated.map(entryOf),
      skippedReasons,
    };
  }

  private toProps(input: {
    proposal: ExtractedLoop;
    signal: Signal;
    now: Instant;
  }): OpenLoopProps {
    const { proposal, signal, now } = input;
    const source = {
      provider: signal.provider,
      externalId: signal.externalId,
      occurredAt: signal.occurredAt,
      ...(signal.threadRef === undefined ? {} : { threadRef: signal.threadRef }),
      ...(signal.url === undefined ? {} : { url: signal.url }),
      ...(signal.channel === undefined ? {} : { channel: signal.channel }),
    };
    void sourceKey(source);
    return {
      id: asOpenLoopId(this.deps.ids.next()),
      kind: proposal.kind,
      title: proposal.title,
      summary: proposal.summary,
      source,
      ...(proposal.counterparty === undefined ? {} : { counterparty: proposal.counterparty }),
      criteria: proposal.criteria.map((criterion) => ({
        ...criterion,
        id: asCriterionId(this.deps.ids.next()),
      })),
      evidence: [],
      ...(proposal.dueAt === undefined ? {} : { dueAt: proposal.dueAt }),
      ...(proposal.promisedFor === undefined ? {} : { promisedFor: proposal.promisedFor }),
      estimate: proposal.estimate,
      priority: proposal.priority,
      confidence: proposal.confidence,
      createdAt: now,
      updatedAt: now,
    };
  }
}

const entryOf = (loop: OpenLoop): LoopEntry => {
  const props = loop.snapshot();
  return {
    loopId: String(props.id),
    title: props.title,
    provider: props.source.provider,
    externalId: props.source.externalId,
  };
};
