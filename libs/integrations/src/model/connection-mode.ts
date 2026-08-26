/**
 * How a provider's data reaches us. `Hosted` is Composio-brokered OAuth; `LocalAgent` is the
 * mode where an AI client that already holds the user's sessions writes in directly.
 */
export const ConnectionMode = {
  Hosted: 'HOSTED',
  LocalAgent: 'LOCAL_AGENT',
  ApiKey: 'API_KEY',
} as const;
export type ConnectionMode = (typeof ConnectionMode)[keyof typeof ConnectionMode];

export const ConnectionStatus = {
  Disconnected: 'DISCONNECTED',
  Pending: 'PENDING',
  Active: 'ACTIVE',
  Expired: 'EXPIRED',
  Failed: 'FAILED',
} as const;
export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus];
