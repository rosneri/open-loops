import type { Instant } from '@open-loops/kernel';
import type { OpenLoopId } from './ids.js';
import type { LoopStatus } from './loop-status.js';

export const LoopEventType = {
  Created: 'LOOP_CREATED',
  EvidenceRecorded: 'LOOP_EVIDENCE_RECORDED',
  StatusChanged: 'LOOP_STATUS_CHANGED',
  Snoozed: 'LOOP_SNOOZED',
  Dropped: 'LOOP_DROPPED',
  Reopened: 'LOOP_REOPENED',
} as const;
export type LoopEventType = (typeof LoopEventType)[keyof typeof LoopEventType];

interface LoopEventBase<TType extends LoopEventType> {
  readonly type: TType;
  readonly loopId: OpenLoopId;
  readonly at: Instant;
}

export interface LoopCreatedEvent extends LoopEventBase<typeof LoopEventType.Created> {
  readonly title: string;
}

export interface LoopEvidenceRecordedEvent
  extends LoopEventBase<typeof LoopEventType.EvidenceRecorded> {
  readonly observationCount: number;
}

export interface LoopStatusChangedEvent extends LoopEventBase<typeof LoopEventType.StatusChanged> {
  readonly from: LoopStatus;
  readonly to: LoopStatus;
  readonly reason: string;
}

export interface LoopSnoozedEvent extends LoopEventBase<typeof LoopEventType.Snoozed> {
  readonly until: Instant;
}

export interface LoopDroppedEvent extends LoopEventBase<typeof LoopEventType.Dropped> {
  readonly reason: string;
}

export type LoopReopenedEvent = LoopEventBase<typeof LoopEventType.Reopened>;

export type LoopEvent =
  | LoopCreatedEvent
  | LoopEvidenceRecordedEvent
  | LoopStatusChangedEvent
  | LoopSnoozedEvent
  | LoopDroppedEvent
  | LoopReopenedEvent;

export interface LoopEventPublisher {
  publish(events: readonly LoopEvent[]): Promise<void>;
}
