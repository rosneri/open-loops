/** A step that failed without taking the whole tick down: one provider, or one reasoning step. */
export interface TickFailureDto {
  /** The provider name, or the name of the step: `extract`, `reconcile`, `plan`. */
  readonly source: string;
  readonly error: string;
}

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
  readonly failures: readonly TickFailureDto[];
}
