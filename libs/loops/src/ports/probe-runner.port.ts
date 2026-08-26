import type { Instant } from '@open-loops/kernel';
import type { Evidence } from '../model/evidence.js';
import type { CriterionId, OpenLoopId } from '../model/ids.js';
import type { Probe } from '../model/probe.js';

export interface ProbeRequest {
  readonly loopId: OpenLoopId;
  readonly criterionId: CriterionId;
  readonly probe: Probe;
  readonly at: Instant;
}

/**
 * Runs one probe against the real world and returns a verdict. Implementations are dumb by
 * design: they answer "does this PR exist", never "is the task finished".
 */
export interface ProbeRunner {
  canRun(probe: Probe): boolean;
  run(request: ProbeRequest): Promise<Evidence>;
}
