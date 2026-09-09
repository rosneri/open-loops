export type ConnectionStatusDto =
  | 'DISCONNECTED'
  | 'PENDING'
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
}

export interface BeginConnectionDto {
  readonly provider: string;
  readonly redirectUrl?: string;
  readonly externalAccountRef: string;
  readonly alreadyActive: boolean;
}
