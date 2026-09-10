import type { ActivityRunDto, ActivityRunSummaryDto } from '@open-loops/contracts';

/**
 * Where a sweep's own account of itself is kept. A port rather than a repository call inside the
 * tick, because recording what happened must never be able to change what happened: a store that
 * is down loses the record and nothing else.
 */
export interface TickRunStore {
  record(run: ActivityRunDto): Promise<void>;
  list(input: { limit: number }): Promise<readonly ActivityRunSummaryDto[]>;
  findById(id: string): Promise<ActivityRunDto | undefined>;
}
