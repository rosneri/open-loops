import type { CriterionId } from './ids.js';
import type { Probe } from './probe.js';

/**
 * Criteria are split by role, and that split is the entire trick behind "done but not
 * confirmed": shipping the PR satisfies the deliverable, telling your manager satisfies the
 * acknowledgement, and the two fail independently.
 */
export const CriterionRole = {
  Deliverable: 'DELIVERABLE',
  Acknowledgement: 'ACKNOWLEDGEMENT',
} as const;
export type CriterionRole = (typeof CriterionRole)[keyof typeof CriterionRole];

export interface CompletionCriterion {
  readonly id: CriterionId;
  readonly role: CriterionRole;
  readonly probe: Probe;
  /** Optional criteria move the progress bar but never block completion. */
  readonly optional: boolean;
}

export const withRole = (
  criteria: readonly CompletionCriterion[],
  role: CriterionRole,
): readonly CompletionCriterion[] => criteria.filter((criterion) => criterion.role === role);
