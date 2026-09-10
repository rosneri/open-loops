import type { TickReportDto } from './tick.dto.js';

/** One loop a step acted on, named rather than counted. */
export interface ActivityLoopDto {
  readonly loopId: string;
  readonly title: string;
  readonly provider: string;
  readonly externalId: string;
}

/** One upstream call, with the broker's own log id so it can be looked up on their side. */
export interface ActivityToolCallDto {
  readonly slug: string;
  readonly logId: string;
  readonly ok: boolean;
  readonly error?: string;
  readonly at: number;
  readonly intent?: string;
}

/**
 * What the run's counts were made of. The report says a sweep created three loops and fetched
 * nothing from GitHub; this says which three, and which tool GitHub was asked with — the part
 * that turns "it did not work" into a thing somebody can look at.
 */
export interface ActivityDetailDto {
  readonly fetchedPerProvider: Readonly<Record<string, number>>;
  /** Sources nothing pulled because they arrive by push. Not failures. */
  readonly pushProviders: readonly string[];
  readonly created: readonly ActivityLoopDto[];
  readonly restated: readonly ActivityLoopDto[];
  readonly pruned: readonly ActivityLoopDto[];
  readonly prunedProviders: readonly string[];
  readonly keptAsHistory: number;
  readonly skipped: readonly { readonly sourceExternalId: string; readonly reason: string }[];
  readonly toolCalls: readonly ActivityToolCallDto[];
}

/** A row in the list: enough to scan a history without loading every run's detail. */
export interface ActivityRunSummaryDto {
  readonly id: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly failed: boolean;
  readonly signalsFetched: number;
  readonly loopsCreated: number;
  readonly loopsRestated: number;
  readonly loopsPruned: number;
  readonly failureCount: number;
}

export interface ActivityRunDto {
  readonly id: string;
  readonly report: TickReportDto;
  readonly detail: ActivityDetailDto;
}
