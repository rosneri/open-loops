import type { Clock, Logger } from '@open-loops/kernel';

/**
 * One named unit of the heartbeat. The tick used to be five method calls in a fixed order;
 * naming them and declaring what each runs after is what lets a feature add a sixth without
 * editing the use case that runs them.
 *
 * A step reports counters and nothing else. It cannot fail the tick — the runner isolates each
 * one, because work an earlier step committed must survive a later step throwing.
 */
export interface TickStepContext {
  readonly ownerId: string;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** Whatever the step wants to see in the tick report, as flat counters. */
export type TickStepReport = Readonly<Record<string, number>>;

export interface TickStep {
  readonly name: string;
  /** Names of steps that must have run first. A cycle is a boot-time error, not a deadlock. */
  readonly after?: readonly string[] | undefined;
  run(context: TickStepContext): Promise<TickStepReport | undefined>;
}
