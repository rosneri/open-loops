import type { Instant } from '@open-loops/kernel';
import type { CriterionId } from './ids.js';

export const EvidenceVerdict = {
  Satisfied: 'SATISFIED',
  NotSatisfied: 'NOT_SATISFIED',
  /** The probe could not be run — token expired, provider down, rate limited. */
  Inconclusive: 'INCONCLUSIVE',
} as const;
export type EvidenceVerdict = (typeof EvidenceVerdict)[keyof typeof EvidenceVerdict];

/**
 * One observation of one criterion at one moment. Evidence is append-only: the history is what
 * lets the timeline explain why a loop moved, and it guarantees an inconclusive probe can never
 * silently erase a previously satisfied one.
 */
export interface Evidence {
  readonly criterionId: CriterionId;
  readonly verdict: EvidenceVerdict;
  readonly observedAt: Instant;
  readonly summary: string;
  readonly url?: string;
}

/** The latest conclusive observation per criterion; inconclusive runs are skipped, not counted. */
export const latestConclusiveByCriterion = (
  evidence: readonly Evidence[],
): ReadonlyMap<CriterionId, Evidence> => {
  const latest = new Map<CriterionId, Evidence>();
  for (const item of evidence) {
    if (item.verdict === EvidenceVerdict.Inconclusive) continue;
    const current = latest.get(item.criterionId);
    if (current === undefined || current.observedAt <= item.observedAt) {
      latest.set(item.criterionId, item);
    }
  }
  return latest;
};
