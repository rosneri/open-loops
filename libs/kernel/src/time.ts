import type { Brand } from './branded.js';

/** Milliseconds since the Unix epoch. No domain code ever touches `Date`. */
export type Instant = Brand<number, 'Instant'>;
export type Minutes = Brand<number, 'Minutes'>;
/** A local calendar day, `YYYY-MM-DD`. Produced at the edge, where a timezone is known. */
export type DayKey = Brand<string, 'DayKey'>;

const MS_PER_MINUTE = 60_000;

export const asInstant = (epochMillis: number): Instant => epochMillis as Instant;
export const asMinutes = (value: number): Minutes => value as Minutes;
export const asDayKey = (value: string): DayKey => value as DayKey;

export const addMinutes = (instant: Instant, minutes: Minutes): Instant =>
  asInstant(instant + minutes * MS_PER_MINUTE);

export const minutesBetween = (from: Instant, to: Instant): Minutes =>
  asMinutes((to - from) / MS_PER_MINUTE);

export const earliest = (left: Instant, right: Instant): Instant => (left < right ? left : right);
export const latest = (left: Instant, right: Instant): Instant => (left > right ? left : right);

/** A half-open interval `[startAt, endAt)`. */
export interface TimeRange {
  readonly startAt: Instant;
  readonly endAt: Instant;
}

export const overlaps = (left: TimeRange, right: TimeRange): boolean =>
  left.startAt < right.endAt && right.startAt < left.endAt;

/**
 * The injected time source. Day boundaries live here because "today" is a timezone question,
 * and the domain must not have an opinion about the user's timezone.
 */
export interface Clock {
  now(): Instant;
  startOfDay(instant: Instant): Instant;
  dayKey(instant: Instant): DayKey;
}
