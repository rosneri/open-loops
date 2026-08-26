import type { DayKey, Instant } from '@open-loops/kernel';
import type { DailyPlan } from '../model/daily-plan.js';
import type { BusyInterval } from '../model/planned-block.js';

export interface DailyPlanRepository {
  findByDay(day: DayKey): Promise<DailyPlan | undefined>;
  save(plan: DailyPlan): Promise<void>;
}

/** Calendar time the planner must not schedule over. */
export interface BusyTimeProvider {
  listBusy(input: { dayStartAt: Instant }): Promise<readonly BusyInterval[]>;
}
