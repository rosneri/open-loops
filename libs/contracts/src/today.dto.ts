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

export interface TodayDto {
  readonly day: string;
  readonly now: number;
  readonly timeZone: string;
  readonly windowStartAt: number;
  readonly windowEndAt: number;
  readonly items: readonly LoopDto[];
  readonly counts: Readonly<Record<LoopStatusDto, number>>;
}
