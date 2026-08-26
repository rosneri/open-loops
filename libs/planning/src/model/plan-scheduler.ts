import type { Instant, Minutes, TimeRange } from '@open-loops/kernel';
import { addMinutes, asMinutes, latest, overlaps } from '@open-loops/kernel';
import type { WorkRef } from './ids.js';
import type { PlanCandidate } from './plan-candidate.js';
import type { BusyInterval, PlannedBlock } from './planned-block.js';
import { BlockDisposition } from './planned-block.js';

export interface PlanWindow {
  readonly dayStartAt: Instant;
  readonly startMinute: Minutes;
  readonly endMinute: Minutes;
}

export interface RebalanceInput {
  readonly now: Instant;
  readonly window: PlanWindow;
  readonly candidates: readonly PlanCandidate[];
  readonly busy: readonly BusyInterval[];
  readonly previous: readonly PlannedBlock[];
  /** Manual drag order. Lower wins, and always beats the computed score. */
  readonly manualOrder: ReadonlyMap<WorkRef, number>;
}

const HOUR_MS = 3_600_000;
const MIN_BLOCK_MINUTES = 5;
const OVERDUE_BONUS = 400;
const DUE_SOON_BONUS = 200;
const ACKNOWLEDGEMENT_BONUS = 250;
const STARTED_BONUS = 120;
const REQUEST_BONUS = 60;

/**
 * A "tell them it's done" item is worth two minutes and unblocks a person, so it outranks a
 * half-finished feature. Overdue beats everything except an explicit manual drag.
 */
const scoreOf = (candidate: PlanCandidate, now: Instant): number => {
  let score = candidate.weight;
  if (candidate.isOverdue) score += OVERDUE_BONUS;
  if (candidate.dueAt !== undefined && !candidate.isOverdue) {
    const hoursLeft = (candidate.dueAt - now) / HOUR_MS;
    score += hoursLeft < 24 ? DUE_SOON_BONUS - hoursLeft : 0;
  }
  if (candidate.awaitingOnlyAcknowledgement) score += ACKNOWLEDGEMENT_BONUS;
  if (candidate.isStarted) score += STARTED_BONUS;
  if (candidate.isExternalRequest) score += REQUEST_BONUS;
  return score;
};

const rank = (input: RebalanceInput): readonly PlanCandidate[] =>
  [...input.candidates].sort((left, right) => {
    const manualLeft = input.manualOrder.get(left.ref);
    const manualRight = input.manualOrder.get(right.ref);
    if (manualLeft !== undefined || manualRight !== undefined) {
      return (manualLeft ?? Number.MAX_SAFE_INTEGER) - (manualRight ?? Number.MAX_SAFE_INTEGER);
    }
    return scoreOf(right, input.now) - scoreOf(left, input.now);
  });

const windowStart = (window: PlanWindow): Instant =>
  addMinutes(window.dayStartAt, window.startMinute);
const windowEnd = (window: PlanWindow): Instant => addMinutes(window.dayStartAt, window.endMinute);

/** Earliest instant at or after `from` where `duration` fits without hitting busy time. */
const nextFreeStart = (input: {
  from: Instant;
  duration: Minutes;
  blocked: readonly TimeRange[];
  limit: Instant;
}): Instant | undefined => {
  let cursor = input.from;
  const ordered = [...input.blocked].sort((left, right) => left.startAt - right.startAt);
  for (const interval of ordered) {
    const attempt: TimeRange = { startAt: cursor, endAt: addMinutes(cursor, input.duration) };
    if (attempt.endAt > input.limit) return undefined;
    if (overlaps(attempt, interval)) cursor = latest(cursor, interval.endAt);
  }
  return addMinutes(cursor, input.duration) <= input.limit ? cursor : undefined;
};

const slipCountFor = (input: {
  ref: WorkRef;
  startAt: Instant;
  previous: readonly PlannedBlock[];
}): number => {
  const before = input.previous.find((block) => block.ref === input.ref);
  if (before === undefined) return 0;
  return input.startAt > before.range.startAt ? before.slipCount + 1 : before.slipCount;
};

const dispositionFor = (range: TimeRange, now: Instant): BlockDisposition =>
  range.startAt <= now && now < range.endAt ? BlockDisposition.Current : BlockDisposition.Scheduled;

/**
 * Rebalancing is a pure function of (candidates, busy time, now). Nothing about the plan is
 * stored except the human's overrides — so the hourly tick simply calls this again, and a task
 * that did not get done reorders itself around whatever is now more urgent.
 */
export const rebalance = (input: RebalanceInput): readonly PlannedBlock[] => {
  const limit = windowEnd(input.window);
  const pinned = input.previous.filter((block) => block.pinned);
  const blocked: TimeRange[] = [...input.busy, ...pinned.map((block) => block.range)];
  const placed: PlannedBlock[] = pinned.map((block, index) => ({
    ...block,
    order: index,
    disposition: dispositionFor(block.range, input.now),
  }));

  let cursor = latest(input.now, windowStart(input.window));
  let order = placed.length;

  for (const candidate of rank(input)) {
    if (placed.some((block) => block.ref === candidate.ref)) continue;
    const duration = asMinutes(Math.max(MIN_BLOCK_MINUTES, candidate.estimate));
    const startAt = nextFreeStart({ from: cursor, duration, blocked, limit });
    const slipCount = slipCountFor({
      ref: candidate.ref,
      startAt: startAt ?? limit,
      previous: input.previous,
    });

    if (startAt === undefined) {
      placed.push({
        ref: candidate.ref,
        range: { startAt: limit, endAt: limit },
        order,
        disposition: BlockDisposition.Deferred,
        slipCount,
        pinned: false,
      });
    } else {
      const range: TimeRange = { startAt, endAt: addMinutes(startAt, duration) };
      placed.push({
        ref: candidate.ref,
        range,
        order,
        disposition: dispositionFor(range, input.now),
        slipCount,
        pinned: false,
      });
      blocked.push(range);
      cursor = range.endAt;
    }
    order += 1;
  }

  return placed.sort(
    (left, right) => left.range.startAt - right.range.startAt || left.order - right.order,
  );
};
