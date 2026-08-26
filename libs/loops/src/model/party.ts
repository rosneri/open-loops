/** The other human in the loop: who asked, or who is owed an answer. */
export interface Party {
  readonly displayName: string;
  readonly handle?: string;
  readonly email?: string;
  /** A cheap planner signal: a request from your manager outranks one from a bot. */
  readonly importance?: 'LOW' | 'NORMAL' | 'HIGH';
}
