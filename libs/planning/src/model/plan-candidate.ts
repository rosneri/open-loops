import type { Instant, Minutes } from '@open-loops/kernel';
import type { WorkRef } from './ids.js';

/**
 * Planning's own vocabulary for a piece of work. Deliberately not `OpenLoopView`: the scheduler
 * must not know what a "loop kind" is. Whoever calls it translates their concepts into these
 * four flags, which is the anticorruption layer between the two contexts.
 */
export interface PlanCandidate {
  readonly ref: WorkRef;
  readonly estimate: Minutes;
  /** 0..100 baseline importance before any of the situational bonuses below. */
  readonly weight: number;
  readonly dueAt?: Instant;
  readonly isOverdue: boolean;
  /** The work itself is finished; all that is left is telling somebody. Usually two minutes. */
  readonly awaitingOnlyAcknowledgement: boolean;
  readonly isStarted: boolean;
  /** Somebody else is blocked on this. */
  readonly isExternalRequest: boolean;
}
