import { DomainError } from '@open-loops/kernel';
import { ConnectionMode } from './connection-mode.js';

export const WriteOperation = {
  Create: 'CREATE',
  Update: 'UPDATE',
  Delete: 'DELETE',
} as const;
export type WriteOperation = (typeof WriteOperation)[keyof typeof WriteOperation];

export interface IngestionCapability {
  readonly allowed: ReadonlySet<WriteOperation>;
}

/**
 * What an ingestion channel may do to the store. A hosted connector is a firehose we do not
 * fully trust, so it may only append. The local agent is the user's own machine driving their
 * own sessions, so it may also correct what it wrote. Enforced once, at the ingestion boundary,
 * rather than being re-checked in every adapter.
 */
export const ingestionCapabilityFor = (mode: ConnectionMode): IngestionCapability => {
  switch (mode) {
    case ConnectionMode.LocalAgent:
      return {
        allowed: new Set([WriteOperation.Create, WriteOperation.Update, WriteOperation.Delete]),
      };
    case ConnectionMode.Hosted:
    case ConnectionMode.ApiKey:
      return { allowed: new Set([WriteOperation.Create]) };
  }
};

export const assertAllowed = (input: {
  capability: IngestionCapability;
  operation: WriteOperation;
}): void => {
  if (input.capability.allowed.has(input.operation)) return;
  throw new DomainError(
    'INGESTION_NOT_PERMITTED',
    `This ingestion channel may not ${input.operation.toLowerCase()} records.`,
  );
};
