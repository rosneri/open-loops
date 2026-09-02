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
  /**
   * Whatever the registered tick steps counted, keyed by step name. The four steps above are the
   * product and are not extensible; this is where a plugin's own work shows up, so adding one
   * does not mean adding a field to the report every client already parses.
   */
  readonly steps?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly failures: readonly TickFailureDto[];
}
