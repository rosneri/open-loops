/**
 * The wire shape of the day. Every client — the React app today, a CLI or a mobile client
 * later — reads this and nothing else, which is why it holds plain JSON types rather than
 * branded domain values.
 */
export type LoopStatusDto =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'DONE_UNCONFIRMED'
  | 'DONE'
  | 'SNOOZED'
  | 'DROPPED';

export type BlockDispositionDto = 'SCHEDULED' | 'CURRENT' | 'DEFERRED';

export interface CriterionDto {
  readonly id: string;
  readonly role: 'DELIVERABLE' | 'ACKNOWLEDGEMENT';
  readonly label: string;
  readonly satisfied: boolean;
}

export interface LoopDto {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly kind: string;
  readonly status: LoopStatusDto;
  readonly provider: string;
  readonly url?: string;
  readonly counterparty?: string;
  readonly progress: number;
  readonly estimateMinutes: number;
  readonly startAt?: number;
  readonly endAt?: number;
  readonly disposition?: BlockDispositionDto;
  readonly slipCount: number;
  readonly isOverdue: boolean;
  readonly dueAt?: number;
  readonly lastCheckedAt?: number;
  readonly criteria: readonly CriterionDto[];
}

/**
 * Time the planner had to work around rather than work with: meetings and anything else on the
 * calendar. Shown because a day that hides them looks emptier than it is — the plan already
 * schedules around this time, and a person reading the timeline could not see why.
 */
export interface FixedBlockDto {
  readonly startAt: number;
  readonly endAt: number;
  readonly label: string;
}

export interface TodayDto {
  readonly day: string;
  readonly now: number;
  readonly timeZone: string;
  readonly windowStartAt: number;
  readonly windowEndAt: number;
  readonly items: readonly LoopDto[];
  /** Calendar time, which nothing can move. Ordered by when it starts. */
  readonly fixed: readonly FixedBlockDto[];
  readonly counts: Readonly<Record<LoopStatusDto, number>>;
}
