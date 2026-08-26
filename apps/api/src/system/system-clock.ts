import type { Clock, DayKey, Instant } from '@open-loops/kernel';
import { asDayKey, asInstant } from '@open-loops/kernel';

/**
 * The only place in the system that calls `Date.now`. Day boundaries are computed in the user's
 * configured timezone, so "today" means what they think it means.
 */
export class SystemClock implements Clock {
  private readonly dayFormatter: Intl.DateTimeFormat;

  public constructor(private readonly timeZone: string) {
    this.dayFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  public now(): Instant {
    return asInstant(Date.now());
  }

  public dayKey(instant: Instant): DayKey {
    return asDayKey(this.dayFormatter.format(new Date(instant)));
  }

  public startOfDay(instant: Instant): Instant {
    const midnightUtc = Date.parse(`${this.dayKey(instant)}T00:00:00Z`);
    return asInstant(midnightUtc - this.offsetAt(asInstant(midnightUtc)));
  }

  /** Milliseconds the configured zone is ahead of UTC at that instant, DST included. */
  private offsetAt(instant: Instant): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(instant));
    const label = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(label);
    if (match === null) return 0;
    const [, sign, hours = '0', minutes = '0'] = match;
    const magnitude = Number(hours) * 3_600_000 + Number(minutes) * 60_000;
    return sign === '-' ? -magnitude : magnitude;
  }
}
