/**
 * Status is derived, never assigned — except for the explicit human overrides. It is the
 * product of two independent axes: was the work done, and was the person waiting told about it.
 */
export const LoopStatus = {
  Open: 'OPEN',
  InProgress: 'IN_PROGRESS',
  /** The deliverable exists but nobody was told. The state this whole product is built around. */
  DoneUnconfirmed: 'DONE_UNCONFIRMED',
  Done: 'DONE',
  Snoozed: 'SNOOZED',
  Dropped: 'DROPPED',
} as const;
export type LoopStatus = (typeof LoopStatus)[keyof typeof LoopStatus];

export const WorkState = {
  NotStarted: 'NOT_STARTED',
  InProgress: 'IN_PROGRESS',
  Done: 'DONE',
} as const;
export type WorkState = (typeof WorkState)[keyof typeof WorkState];

export const AcknowledgementState = {
  NotRequired: 'NOT_REQUIRED',
  Pending: 'PENDING',
  Sent: 'SENT',
} as const;
export type AcknowledgementState = (typeof AcknowledgementState)[keyof typeof AcknowledgementState];

export const isTerminal = (status: LoopStatus): boolean =>
  status === LoopStatus.Done || status === LoopStatus.Dropped;

/** Loops that still deserve space in today's plan. */
export const isActionable = (status: LoopStatus): boolean =>
  status === LoopStatus.Open ||
  status === LoopStatus.InProgress ||
  status === LoopStatus.DoneUnconfirmed;
