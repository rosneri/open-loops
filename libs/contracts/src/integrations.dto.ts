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
  /** False when the deployment has no adapter bound for this provider yet. */
  readonly connectable: boolean;
}

export interface BeginConnectionDto {
  readonly provider: string;
  readonly redirectUrl?: string;
  readonly externalAccountRef: string;
  readonly alreadyActive: boolean;
}
