import { DomainError, type Instant, type Minutes } from '@open-loops/kernel';
import type { CompletionCriterion } from './completion-criterion.js';
import type { CompletionAssessment } from './completion-policy.js';
import { assessCompletion } from './completion-policy.js';
import type { Evidence } from './evidence.js';
import type { OpenLoopId } from './ids.js';
import type { LoopEvent } from './loop-events.js';
import { LoopEventType } from './loop-events.js';
import type { LoopKind } from './loop-kind.js';
import type { LoopStatus } from './loop-status.js';
import { LoopStatus as Status } from './loop-status.js';
import type { Party } from './party.js';
import type { SourceRef } from './source-ref.js';

export const ManualResolution = {
  Done: 'DONE',
  Dropped: 'DROPPED',
} as const;
export type ManualResolution = (typeof ManualResolution)[keyof typeof ManualResolution];

/** Everything about a loop that does not change when the clock ticks. */
export interface OpenLoopProps {
  readonly id: OpenLoopId;
  readonly kind: LoopKind;
  readonly title: string;
  readonly summary: string;
  readonly source: SourceRef;
  readonly counterparty?: Party;
  readonly criteria: readonly CompletionCriterion[];
  readonly evidence: readonly Evidence[];
  readonly dueAt?: Instant;
  readonly promisedFor?: Instant;
  readonly estimate: Minutes;
  /** 0..100. How much this loop deserves the next free hour. */
  readonly priority: number;
  /** 0..1. How sure the extractor was that this is a real obligation. */
  readonly confidence: number;
  readonly manualResolution?: { readonly state: ManualResolution; readonly reason: string };
  readonly snoozedUntil?: Instant;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly lastCheckedAt?: Instant;
}

/** Props plus everything time-dependent — what the planner and every client actually read. */
export interface OpenLoopView extends OpenLoopProps {
  readonly status: LoopStatus;
  readonly assessment: CompletionAssessment;
  readonly isOverdue: boolean;
}

/**
 * The aggregate root. Every state change goes through a method, every method takes the instant
 * from its caller rather than a clock, and every status transition is emitted as an event so
 * the day can be reconstructed after the fact.
 */
export class OpenLoop {
  private props: OpenLoopProps;
  private readonly events: LoopEvent[] = [];

  private constructor(props: OpenLoopProps) {
    this.props = props;
  }

  public static rehydrate(props: OpenLoopProps): OpenLoop {
    return new OpenLoop(props);
  }

  public static create(props: OpenLoopProps): OpenLoop {
    if (props.title.trim().length === 0) {
      throw new DomainError('LOOP_TITLE_REQUIRED', 'An open loop needs a title.');
    }
    if (props.confidence < 0 || props.confidence > 1) {
      throw new DomainError('LOOP_CONFIDENCE_RANGE', 'Confidence must be within 0..1.');
    }
    const loop = new OpenLoop(props);
    loop.events.push({
      type: LoopEventType.Created,
      loopId: props.id,
      at: props.createdAt,
      title: props.title,
    });
    return loop;
  }

  public get id(): OpenLoopId {
    return this.props.id;
  }

  public snapshot(): OpenLoopProps {
    return this.props;
  }

  public pullEvents(): readonly LoopEvent[] {
    return this.events.splice(0, this.events.length);
  }

  public view(now: Instant): OpenLoopView {
    const assessment = assessCompletion({
      kind: this.props.kind,
      criteria: this.props.criteria,
      evidence: this.props.evidence,
    });
    return {
      ...this.props,
      assessment,
      status: this.statusAt(now, assessment),
      isOverdue: this.props.dueAt !== undefined && this.props.dueAt < now,
    };
  }

  private statusAt(now: Instant, assessment: CompletionAssessment): LoopStatus {
    const resolution = this.props.manualResolution;
    if (resolution?.state === ManualResolution.Dropped) return Status.Dropped;
    if (resolution?.state === ManualResolution.Done) return Status.Done;
    if (this.props.snoozedUntil !== undefined && this.props.snoozedUntil > now) {
      return Status.Snoozed;
    }
    return assessment.status;
  }

  /** Append probe results. Existing evidence is never overwritten, only superseded. */
  public recordEvidence(input: { observations: readonly Evidence[]; at: Instant }): void {
    if (input.observations.length === 0) return;
    this.transition({ at: input.at, reason: 'evidence recorded' }, () => {
      this.props = {
        ...this.props,
        evidence: [...this.props.evidence, ...input.observations],
        updatedAt: input.at,
        lastCheckedAt: input.at,
      };
      this.events.push({
        type: LoopEventType.EvidenceRecorded,
        loopId: this.props.id,
        at: input.at,
        observationCount: input.observations.length,
      });
    });
  }

  /** A probe ran and told us nothing; we still want to know the loop was looked at. */
  public markChecked(at: Instant): void {
    this.props = { ...this.props, lastCheckedAt: at };
  }

  public reviseCriteria(input: { criteria: readonly CompletionCriterion[]; at: Instant }): void {
    this.transition({ at: input.at, reason: 'criteria revised' }, () => {
      this.props = { ...this.props, criteria: input.criteria, updatedAt: input.at };
    });
  }

  public reprioritise(input: { priority: number; estimate?: Minutes; at: Instant }): void {
    this.props = {
      ...this.props,
      priority: Math.min(100, Math.max(0, input.priority)),
      ...(input.estimate === undefined ? {} : { estimate: input.estimate }),
      updatedAt: input.at,
    };
  }

  public snooze(input: { until: Instant; at: Instant }): void {
    if (input.until <= input.at) {
      throw new DomainError('SNOOZE_IN_PAST', 'Snoozing must move a loop into the future.');
    }
    this.transition({ at: input.at, reason: 'snoozed' }, () => {
      this.props = { ...this.props, snoozedUntil: input.until, updatedAt: input.at };
      this.events.push({
        type: LoopEventType.Snoozed,
        loopId: this.props.id,
        at: input.at,
        until: input.until,
      });
    });
  }

  public drop(input: { reason: string; at: Instant }): void {
    this.transition({ at: input.at, reason: input.reason }, () => {
      this.props = {
        ...this.props,
        manualResolution: { state: ManualResolution.Dropped, reason: input.reason },
        updatedAt: input.at,
      };
      this.events.push({
        type: LoopEventType.Dropped,
        loopId: this.props.id,
        at: input.at,
        reason: input.reason,
      });
    });
  }

  /** The escape hatch for loops no probe can see. Recorded as a human decision, not evidence. */
  public confirmDone(input: { reason: string; at: Instant }): void {
    this.transition({ at: input.at, reason: input.reason }, () => {
      this.props = {
        ...this.props,
        manualResolution: { state: ManualResolution.Done, reason: input.reason },
        updatedAt: input.at,
      };
    });
  }

  public reopen(at: Instant): void {
    this.transition({ at, reason: 'reopened' }, () => {
      const { manualResolution: _resolved, snoozedUntil: _snoozed, ...rest } = this.props;
      this.props = { ...rest, updatedAt: at };
      this.events.push({ type: LoopEventType.Reopened, loopId: this.props.id, at });
    });
  }

  /** Wraps a mutation so the before/after status comparison happens in exactly one place. */
  private transition(context: { at: Instant; reason: string }, change: () => void): void {
    const before = this.view(context.at).status;
    change();
    const after = this.view(context.at).status;
    if (after === before) return;
    this.events.push({
      type: LoopEventType.StatusChanged,
      loopId: this.props.id,
      at: context.at,
      from: before,
      to: after,
      reason: context.reason,
    });
  }
}
