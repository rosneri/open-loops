export type ConnectionStatusDto =
  | 'DISCONNECTED'
  | 'PENDING'
  | 'AWAITING_SETUP'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'FAILED';

export interface IntegrationDto {
  readonly provider: string;
  readonly status: ConnectionStatusDto;
  readonly mode: 'HOSTED' | 'LOCAL_AGENT' | 'API_KEY';
  readonly accountLabel?: string;
  readonly lastSyncedAt?: number;
  readonly lastError?: string;
  /** False when pressing Connect could not do anything here. */
  readonly connectable: boolean;
  /**
   * How this source's data gets in. `OAUTH` is brokered and connected by pressing a button;
   * `PUSH` has no hosted API at all and arrives at `/api/agent/ingest` from the local agent —
   * Wispr Flow's meeting recaps, RiseUp's cashflow. The screen needs the difference: a push
   * source with no button is working as designed, not waiting on an adapter somebody forgot.
   */
  readonly delivery: 'OAUTH' | 'PUSH';
  /**
   * What the source still needs answering before it can be Active, in the words the screen
   * shows — "Choose which GitHub organisations count". Present only while `status` is
   * `AWAITING_SETUP`, so the card can say what is missing instead of "pending" forever.
   */
  readonly setupLabel?: string;
}

export interface BeginConnectionDto {
  readonly provider: string;
  readonly redirectUrl?: string;
  readonly externalAccountRef: string;
  readonly alreadyActive: boolean;
}
