import { describe, expect, it } from 'vitest';
import { asInstant } from '@open-loops/kernel';
import type { CompletionCriterion, CriterionRole } from './completion-criterion.js';
import { CriterionRole as Role } from './completion-criterion.js';
import { assessCompletion } from './completion-policy.js';
import type { Evidence, EvidenceVerdict } from './evidence.js';
import { EvidenceVerdict as Verdict } from './evidence.js';
import { asCriterionId } from './ids.js';
import { LoopKind } from './loop-kind.js';
import { manualConfirmation } from './probe.js';
import { AcknowledgementState, LoopStatus, WorkState } from './loop-status.js';

const criterion = (id: string, role: CriterionRole): CompletionCriterion => ({
  id: asCriterionId(id),
  role,
  optional: false,
  probe: manualConfirmation(id),
});

const evidence = (id: string, verdict: EvidenceVerdict, at = 1): Evidence => ({
  criterionId: asCriterionId(id),
  verdict,
  observedAt: asInstant(at),
  summary: `${id} ${verdict}`,
});

const PR_AND_TELL = [criterion('pr', Role.Deliverable), criterion('told', Role.Acknowledgement)];

describe('assessCompletion', () => {
  it('leaves an untouched commitment open', () => {
    const result = assessCompletion({
      kind: LoopKind.OutgoingCommitment,
      criteria: PR_AND_TELL,
      evidence: [],
    });
    expect(result.status).toBe(LoopStatus.Open);
    expect(result.work).toBe(WorkState.NotStarted);
  });

  it('reports done-but-not-told when the deliverable lands and nobody was told', () => {
    const result = assessCompletion({
      kind: LoopKind.OutgoingCommitment,
      criteria: PR_AND_TELL,
      evidence: [evidence('pr', Verdict.Satisfied)],
    });
    expect(result.work).toBe(WorkState.Done);
    expect(result.acknowledgement).toBe(AcknowledgementState.Pending);
    expect(result.status).toBe(LoopStatus.DoneUnconfirmed);
  });

  it('closes the loop once the reply is sent', () => {
    const result = assessCompletion({
      kind: LoopKind.OutgoingCommitment,
      criteria: PR_AND_TELL,
      evidence: [evidence('pr', Verdict.Satisfied), evidence('told', Verdict.Satisfied, 2)],
    });
    expect(result.status).toBe(LoopStatus.Done);
    expect(result.progress).toBe(1);
  });

  it('does not demand an acknowledgement nobody is owed', () => {
    const result = assessCompletion({
      kind: LoopKind.AssignedTask,
      criteria: [criterion('pr', Role.Deliverable)],
      evidence: [evidence('pr', Verdict.Satisfied)],
    });
    expect(result.acknowledgement).toBe(AcknowledgementState.NotRequired);
    expect(result.status).toBe(LoopStatus.Done);
  });

  it('never lets an inconclusive probe un-satisfy an earlier observation', () => {
    const result = assessCompletion({
      kind: LoopKind.AssignedTask,
      criteria: [criterion('pr', Role.Deliverable)],
      evidence: [evidence('pr', Verdict.Satisfied, 1), evidence('pr', Verdict.Inconclusive, 5)],
    });
    expect(result.status).toBe(LoopStatus.Done);
  });

  it('does let a later negative observation supersede a positive one', () => {
    const result = assessCompletion({
      kind: LoopKind.AssignedTask,
      criteria: [criterion('pr', Role.Deliverable)],
      evidence: [evidence('pr', Verdict.Satisfied, 1), evidence('pr', Verdict.NotSatisfied, 9)],
    });
    expect(result.status).toBe(LoopStatus.Open);
  });

  it('reads partly satisfied deliverables as in progress', () => {
    const result = assessCompletion({
      kind: LoopKind.AssignedTask,
      criteria: [criterion('a', Role.Deliverable), criterion('b', Role.Deliverable)],
      evidence: [evidence('a', Verdict.Satisfied)],
    });
    expect(result.status).toBe(LoopStatus.InProgress);
    expect(result.progress).toBe(0.5);
  });
});
