import type { LoopEvent, LoopEventType } from '@open-loops/loops';

/**
 * Subscribers observe. A handler cannot veto the event, cannot mutate the loop and cannot make
 * the publisher wait on anything that matters — this is the notification seam, not a hook into
 * the decision. A handler that throws is logged and the others still run.
 */
export type LoopEventHandler = (event: LoopEvent) => Promise<void>;

export interface EventRegistry {
  on(type: LoopEventType, handler: LoopEventHandler): void;
}
