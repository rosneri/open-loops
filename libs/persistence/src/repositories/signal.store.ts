import type { Instant } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type { Signal, SignalStore, SyncCursorStore } from '@open-loops/signals';
import type { PrismaClient } from '../prisma-client.js';
import { toCreate, toDomain } from '../mappers/signal.mapper.js';

const keyParts = (key: string): { provider: string; externalId: string } => {
  const index = key.indexOf(':');
  return { provider: key.slice(0, index), externalId: key.slice(index + 1) };
};

/**
 * `skipDuplicates` on the (provider, externalId) key is what makes every connector safely
 * re-runnable: a sync that overlaps its own window is a no-op, not a source of duplicate loops.
 */
export class PrismaSignalStore implements SignalStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async append(signals: readonly Signal[]): Promise<number> {
    if (signals.length === 0) return 0;
    const result = await this.prisma.rawSignal.createMany({
      data: signals.map(toCreate),
      skipDuplicates: true,
    });
    return result.count;
  }

  public async listUnprocessed(limit: number): Promise<readonly Signal[]> {
    const rows = await this.prisma.rawSignal.findMany({
      where: { processedAt: null },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  public async listRecent(input: { since: Instant; limit: number }): Promise<readonly Signal[]> {
    const rows = await this.prisma.rawSignal.findMany({
      where: { occurredAt: { gte: new Date(input.since) } },
      orderBy: { occurredAt: 'desc' },
      take: input.limit,
    });
    return rows.map(toDomain);
  }

  /**
   * Grouped by provider so a batch is a handful of `IN` statements instead of one round trip
   * per signal. The per-key version worked against Postgres on localhost and blew the five
   * second interactive-transaction budget against a hosted database — and it needs no
   * transaction at all, because stamping an already-stamped row is a no-op.
   */
  public async markProcessed(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    const now = new Date();
    const byProvider = new Map<string, string[]>();

    for (const key of keys) {
      const { provider, externalId } = keyParts(key);
      const bucket = byProvider.get(provider);
      if (bucket === undefined) byProvider.set(provider, [externalId]);
      else bucket.push(externalId);
    }

    for (const [provider, externalIds] of byProvider) {
      await this.prisma.rawSignal.updateMany({
        where: { provider, externalId: { in: externalIds }, processedAt: null },
        data: { processedAt: now },
      });
    }
  }

  public async pruneBefore(cutoff: Instant): Promise<number> {
    const result = await this.prisma.rawSignal.deleteMany({
      where: { occurredAt: { lt: new Date(cutoff) }, processedAt: { not: null } },
    });
    return result.count;
  }
}

export class PrismaSyncCursorStore implements SyncCursorStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async get(provider: string): Promise<Instant | undefined> {
    const row = await this.prisma.syncCursor.findUnique({ where: { provider } });
    return row === null ? undefined : asInstant(row.at.getTime());
  }

  public async set(input: { provider: string; at: Instant }): Promise<void> {
    const at = new Date(input.at);
    await this.prisma.syncCursor.upsert({
      where: { provider: input.provider },
      create: { provider: input.provider, at },
      update: { at },
    });
  }
}
