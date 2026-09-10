/** One upstream call, as it happened. `logId` is Composio's, which is what makes it checkable. */
export interface ToolCallRecord {
  readonly slug: string;
  readonly toolkit?: string;
  readonly logId: string;
  readonly ok: boolean;
  readonly error?: string;
  readonly at: number;
  /** What the call was asked for, in the words the intent used. Absent for a direct execute. */
  readonly intent?: string;
}

/**
 * What a sweep actually asked the broker for. Counts tell somebody a sync fetched nothing; this
 * tells them which tool was chosen for which intent and what Composio logged about it, which is
 * the difference between "GitHub returned no organisations" and "we called the wrong tool".
 *
 * Bounded, and in memory: it exists for the length of one run and is written into that run's
 * record. A journal that grew without limit would be a leak in a long-lived process.
 */
export class ToolJournal {
  private records: ToolCallRecord[] = [];

  public constructor(private readonly limit = 200) {}

  public record(call: ToolCallRecord): void {
    if (this.records.length >= this.limit) return;
    this.records.push(call);
  }

  /** Reads and clears, so the next run starts empty even on a warm process. */
  public drain(): readonly ToolCallRecord[] {
    const drained = this.records;
    this.records = [];
    return drained;
  }
}
