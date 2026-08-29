import { optional, type SourceProvider } from '@open-loops/kernel';
import type { Signal, SignalActor } from '@open-loops/signals';
import type { Prisma, RawSignal } from '../generated/prisma/client.js';
import { toDate, toInstant, toJson } from './primitives.js';

export const toDomain = (row: RawSignal): Signal => ({
  provider: row.provider as SourceProvider,
  externalId: row.externalId,
  kind: row.kind as Signal['kind'],
  title: row.title,
  body: row.body,
  author: row.author as unknown as SignalActor,
  participants: row.participants as unknown as SignalActor[],
  occurredAt: toInstant(row.occurredAt),
  isDirectedAtMe: row.isDirectedAtMe,
  ...optional('threadRef', row.threadRef),
  ...optional('url', row.url),
  ...optional('channel', row.channel),
  ...optional('metadata', row.metadata as Signal['metadata']),
});

export const toCreate = (signal: Signal): Omit<Prisma.RawSignalCreateManyInput, 'ownerId'> => ({
  provider: signal.provider,
  externalId: signal.externalId,
  kind: signal.kind,
  title: signal.title,
  body: signal.body,
  author: toJson(signal.author),
  participants: toJson(signal.participants),
  occurredAt: toDate(signal.occurredAt),
  threadRef: signal.threadRef ?? null,
  url: signal.url ?? null,
  channel: signal.channel ?? null,
  isDirectedAtMe: signal.isDirectedAtMe,
  metadata: toJson(signal.metadata ?? {}),
});
