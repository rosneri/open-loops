import type { TickStepReport } from '@open-loops/orchestration';
import type { OwnerScope } from '../context.js';

/**
 * A named unit of the heartbeat, contributed by a plugin. Ordering is declared rather than
 * implied by registration order — a plugin loaded second may still need to run before one loaded
 * first, and `after` says so out loud.
 *
 * It runs after the product's own four steps and never instead of them. Sync, extract, reconcile
 * and re-plan are what the app *is*; a plugin adds to the heartbeat, it does not redefine it.
 */
export interface TickStepDefinition {
  readonly name: string;
  /** Names of steps that must have run first. Naming one that is not installed is not an error. */
  readonly after?: readonly string[] | undefined;
  /** Counters for the tick report. Returning nothing means "ran, nothing worth counting". */
  run(scope: OwnerScope): Promise<TickStepReport | undefined>;
}

export interface TickRegistry {
  register(step: TickStepDefinition): void;
}

export type { TickStepReport };
