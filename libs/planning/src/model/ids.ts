import type { Brand } from '@open-loops/kernel';

export type DailyPlanId = Brand<string, 'DailyPlanId'>;
/**
 * Planning refers to work by an opaque reference, not by an `OpenLoopId`. That one choice keeps
 * the scheduler independent of the loops context — the orchestration layer translates, and this
 * library could plan anything with a duration and a deadline.
 */
export type WorkRef = Brand<string, 'WorkRef'>;

export const asDailyPlanId = (value: string): DailyPlanId => value as DailyPlanId;
export const asWorkRef = (value: string): WorkRef => value as WorkRef;
