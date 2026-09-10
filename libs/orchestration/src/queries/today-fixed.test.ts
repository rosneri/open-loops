import { describe, expect, it } from 'vitest';
import type { Clock } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type { BusyTimeProvider } from '@open-loops/planning';
import { TodayViewQuery } from './today-view.query.js';

const DAY_START = 1_800_000_000_000;
const clock: Clock = {
  now: () => asInstant(DAY_START + 3_600_000),
  startOfDay: () => asInstant(DAY_START),
  dayKey: () => '2027-01-15' as ReturnType<Clock['dayKey']>,
};

const queryWith = (busyTime: BusyTimeProvider): TodayViewQuery =>
  new TodayViewQuery({
    loops: { list: () => Promise.resolve([]) } as never,
    plans: { findByDay: () => Promise.resolve(undefined) } as never,
    busyTime,
    clock,
    timeZone: 'Asia/Jerusalem',
  });

describe('calendar time on the day', () => {
  it('shows meetings as their own entries, earliest first', async () => {
    const view = await queryWith({
      listBusy: () =>
        Promise.resolve([
          { startAt: asInstant(DAY_START + 7_200_000), endAt: asInstant(DAY_START + 9_000_000), label: 'Standup' },
          { startAt: asInstant(DAY_START + 3_600_000), endAt: asInstant(DAY_START + 5_400_000), label: '1:1 with Dana' },
        ]),
    }).execute();

    expect(view.fixed.map((block) => block.label)).toEqual(['1:1 with Dana', 'Standup']);
  });

  /**
   * The calendar is the least essential thing on this screen and the most likely to be
   * unreachable. Losing the meetings is acceptable; losing the day is not.
   */
  it('still returns the day when the calendar cannot be read', async () => {
    const view = await queryWith({
      listBusy: () => Promise.reject(new Error('calendar unreachable')),
    }).execute();

    expect(view.fixed).toEqual([]);
    expect(view.day).toBe('2027-01-15');
  });
});
