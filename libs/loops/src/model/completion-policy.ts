import type { CompletionCriterion, CriterionRole } from './completion-criterion.js';
import { CriterionRole as Role, withRole } from './completion-criterion.js';
import type { Evidence } from './evidence.js';
import { EvidenceVerdict, latestConclusiveByCriterion } from './evidence.js';
import type { CriterionId } from './ids.js';
import type { LoopKind } from './loop-kind.js';
import { requiresAcknowledgement } from './loop-kind.js';
import type { AcknowledgementState, LoopStatus, WorkState } from './loop-status.js';
import {
  AcknowledgementState as Ack,
  LoopStatus as Status,
  WorkState as Work,
} from './loop-status.js';

export interface CompletionAssessment {
  readonly work: WorkState;
  readonly acknowledgement: AcknowledgementState;
  readonly status: LoopStatus;
  /** 0..1, drawn as a progress bar and used by the planner to break ties. */
  readonly progress: number;
}

interface Tally {
  readonly required: number;
  readonly satisfied: number;
  readonly satisfiedRequired: number;
  readonly total: number;
}

const tally = (
  criteria: readonly CompletionCriterion[],
  latest: ReadonlyMap<CriterionId, Evidence>,
): Tally => {
  let required = 0;
  let satisfied = 0;
  let satisfiedRequired = 0;
  for (const criterion of criteria) {
    const isSatisfied = latest.get(criterion.id)?.verdict === EvidenceVerdict.Satisfied;
    if (isSatisfied) satisfied += 1;
    if (!criterion.optional) {
      required += 1;
      if (isSatisfied) satisfiedRequired += 1;
    }
  }
  return { required, satisfied, satisfiedRequired, total: criteria.length };
};

const workStateFrom = (counts: Tally): WorkState => {
  if (counts.required > 0 && counts.satisfiedRequired === counts.required) return Work.Done;
  if (counts.satisfied > 0) return Work.InProgress;
  return Work.NotStarted;
};

const acknowledgementStateFrom = (counts: Tally, kind: LoopKind): AcknowledgementState => {
  if (counts.required === 0) {
    return requiresAcknowledgement(kind) ? Ack.Pending : Ack.NotRequired;
  }
  return counts.satisfiedRequired === counts.required ? Ack.Sent : Ack.Pending;
};

const statusFrom = (work: WorkState, acknowledgement: AcknowledgementState): LoopStatus => {
  if (work === Work.Done) {
    return acknowledgement === Ack.Pending ? Status.DoneUnconfirmed : Status.Done;
  }
  return work === Work.InProgress ? Status.InProgress : Status.Open;
};

const progressFrom = (deliverable: Tally, acknowledgement: Tally): number => {
  const total = deliverable.total + acknowledgement.total;
  return total === 0 ? 0 : (deliverable.satisfied + acknowledgement.satisfied) / total;
};

const countFor = (input: {
  criteria: readonly CompletionCriterion[];
  role: CriterionRole;
  latest: ReadonlyMap<CriterionId, Evidence>;
}): Tally => tally(withRole(input.criteria, input.role), input.latest);

export interface AssessCompletionInput {
  readonly kind: LoopKind;
  readonly criteria: readonly CompletionCriterion[];
  readonly evidence: readonly Evidence[];
}

/**
 * The single place where "is it done" is decided. Pure, deterministic, and entirely independent
 * of any model output — the AI's judgement can only enter the system as `Evidence`.
 */
export const assessCompletion = (input: AssessCompletionInput): CompletionAssessment => {
  const latest = latestConclusiveByCriterion(input.evidence);
  const deliverable = countFor({ criteria: input.criteria, role: Role.Deliverable, latest });
  const acknowledgement = countFor({
    criteria: input.criteria,
    role: Role.Acknowledgement,
    latest,
  });

  const work = workStateFrom(deliverable);
  const acknowledged = acknowledgementStateFrom(acknowledgement, input.kind);

  return {
    work,
    acknowledgement: acknowledged,
    status: statusFrom(work, acknowledged),
    progress: progressFrom(deliverable, acknowledgement),
  };
};
