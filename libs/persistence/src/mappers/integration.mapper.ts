import { optional } from '@open-loops/kernel';
import type { IntegrationProps } from '@open-loops/integrations';
import { Integration, asIntegrationId } from '@open-loops/integrations';
import type { Integration as IntegrationRow } from '../generated/prisma/client.js';
import { toDate, toInstant } from './primitives.js';

export const toDomain = (row: IntegrationRow): Integration =>
  Integration.rehydrate({
    id: asIntegrationId(row.id),
    provider: row.provider,
    mode: row.mode as IntegrationProps['mode'],
    status: row.status as IntegrationProps['status'],
    scopes: row.scopes,
    ...optional('accountLabel', row.accountLabel),
    ...optional('externalAccountRef', row.externalAccountRef),
    ...optional('lastSyncedAt', row.lastSyncedAt === null ? null : toInstant(row.lastSyncedAt)),
    ...optional('lastError', row.lastError),
    ...optional('connectedAt', row.connectedAt === null ? null : toInstant(row.connectedAt)),
  });

/** Owner is added by the repository, which is the only thing that knows whose row this is. */
export const toRow = (props: IntegrationProps): Omit<IntegrationRow, 'ownerId'> => ({
  id: props.id,
  provider: props.provider,
  mode: props.mode,
  status: props.status,
  accountLabel: props.accountLabel ?? null,
  externalAccountRef: props.externalAccountRef ?? null,
  scopes: [...props.scopes],
  lastSyncedAt: props.lastSyncedAt === undefined ? null : toDate(props.lastSyncedAt),
  lastError: props.lastError ?? null,
  connectedAt: props.connectedAt === undefined ? null : toDate(props.connectedAt),
});
