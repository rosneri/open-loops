import type { Instant, TimeRange } from '@open-loops/kernel';
import type { WorkRef } from './ids.js';

export const BlockDisposition = {
  Scheduled: 'SCHEDULED',
  /** `now` falls inside this block. */
  Current: 'CURRENT',
  /** Ran out of day. Carried rather than silently dropped. */
  Deferred: 'DEFERRED',
} as const;
export type BlockDisposition = (typeof BlockDisposition)[keyof typeof BlockDisposition];

export interface PlannedBlock {
  readonly ref: WorkRef;
  readonly range: TimeRange;
  readonly order: number;
  readonly disposition: BlockDisposition;
  /** How many rebalances have pushed this block later. Shown as "slipped 3×". */
  readonly slipCount: number;
  /** Set when a human dragged it; the scheduler then treats the slot as immovable. */
  readonly pinned: boolean;
}

/** Meetings and other immovable calendar time the planner must schedule around. */
export interface BusyInterval extends TimeRange {
  readonly label: string;
}

export const blockStart = (block: PlannedBlock): Instant => block.range.startAt;
