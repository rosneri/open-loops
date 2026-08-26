/** The contract between Open Loops and whichever AI client drives it in local mode. */
export interface PendingProbeDto {
  readonly id: string;
  readonly loopId: string;
  readonly criterionId: string;
  readonly describedAs: string;
  readonly probe: Readonly<Record<string, unknown>>;
  readonly requestedAt: string;
}

export interface ProbeAnswerDto {
  readonly id: string;
  readonly verdict: 'SATISFIED' | 'NOT_SATISFIED' | 'INCONCLUSIVE';
  readonly summary: string;
  readonly url?: string;
}

export interface IngestResultDto {
  readonly accepted: number;
  readonly rejected: readonly { readonly key: string; readonly reason: string }[];
}
