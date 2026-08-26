export interface TickReportDto {
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly signalsFetched: number;
  readonly loopsCreated: number;
  readonly loopsChecked: number;
  readonly loopsClosed: number;
  readonly awaitingAcknowledgement: number;
  readonly blocksPlanned: number;
  readonly deferred: number;
  readonly failures: readonly { readonly provider: string; readonly error: string }[];
}
