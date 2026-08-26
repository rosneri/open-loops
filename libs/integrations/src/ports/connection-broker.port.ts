import type { SourceProvider } from '@open-loops/kernel';

export interface ConnectionHandshake {
  readonly externalAccountRef: string;
  /** Present when the user must authorise in a browser. Absent in local mode. */
  readonly redirectUrl?: string;
}

export interface UpstreamConnection {
  readonly provider: SourceProvider;
  readonly externalAccountRef: string;
  readonly accountLabel?: string;
}

export interface ConnectionState {
  readonly active: boolean;
  readonly scopes: readonly string[];
  readonly accountLabel?: string;
}

/**
 * Connecting an account. The hosted broker returns a consent URL that Composio owns, which is
 * the whole reason no OAuth application has to be registered per provider.
 */
export interface ConnectionBroker {
  beginConnection(input: {
    provider: SourceProvider;
    callbackUrl: string;
  }): Promise<ConnectionHandshake>;
  completeConnection(externalAccountRef: string): Promise<ConnectionState>;
  disconnect(externalAccountRef: string): Promise<void>;
  /**
   * Accounts the broker already holds for this user. Authorisation happens once, per Composio
   * account — not once per deployment — so a fresh database can adopt what is already connected
   * instead of dragging the user back through consent.
   */
  listConnected(): Promise<readonly UpstreamConnection[]>;
}
