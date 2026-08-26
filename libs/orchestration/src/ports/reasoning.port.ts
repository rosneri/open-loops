import type { Instant, Minutes } from '@open-loops/kernel';
import type {
  CompletionCriterion,
  Evidence,
  LoopKind,
  OpenLoopView,
  Party,
} from '@open-loops/loops';
import type { Signal } from '@open-loops/signals';

export interface ExtractedLoop {
  /** Must match a signal that was actually handed to the model. Anything else is discarded. */
  readonly sourceExternalId: string;
  readonly kind: LoopKind;
  readonly title: string;
  readonly summary: string;
  readonly counterparty?: Party;
  readonly criteria: readonly Omit<CompletionCriterion, 'id'>[];
  readonly dueAt?: Instant;
  readonly promisedFor?: Instant;
  readonly estimate: Minutes;
  readonly priority: number;
  readonly confidence: number;
}

/** Step one of the agent: turn raw chatter into candidate obligations with checkable criteria. */
export interface LoopExtractor {
  extract(input: { signals: readonly Signal[]; now: Instant }): Promise<readonly ExtractedLoop[]>;
}

export interface ReconciliationVerdict {
  readonly loopId: string;
  /** Evidence the model is confident enough to assert, e.g. "you replied 'done' at 14:02". */
  readonly evidence: readonly Evidence[];
  readonly revisedCriteria?: readonly CompletionCriterion[];
  readonly rationale: string;
  readonly suggestedPriority?: number;
}

/** Step two: judge, using probe results plus fresh signals — and never invent a fact. */
export interface LoopReconciler {
  reconcile(input: {
    loops: readonly OpenLoopView[];
    probeEvidence: readonly Evidence[];
    recentSignals: readonly Signal[];
    now: Instant;
  }): Promise<readonly ReconciliationVerdict[]>;
}
