/**
 * The five kinds map onto the questions the product exists to answer: what did I take on, what
 * did people ask of me, what did I promise, what am I waiting on, what is half-finished.
 */
export const LoopKind = {
  AssignedTask: 'ASSIGNED_TASK',
  IncomingRequest: 'INCOMING_REQUEST',
  OutgoingCommitment: 'OUTGOING_COMMITMENT',
  AwaitingOther: 'AWAITING_OTHER',
  WorkInFlight: 'WORK_IN_FLIGHT',
} as const;

export type LoopKind = (typeof LoopKind)[keyof typeof LoopKind];

export const ALL_LOOP_KINDS: readonly LoopKind[] = Object.values(LoopKind);

/** These kinds owe somebody an answer, so silence is itself an unmet obligation. */
export const requiresAcknowledgement = (kind: LoopKind): boolean =>
  kind === LoopKind.IncomingRequest || kind === LoopKind.OutgoingCommitment;
