import type { Instant } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type { Signal, SignalStore, SyncCursorStore } from '@open-loops/signals';
import { signalChanged } from '@open-loops/signals';
import type { PrismaClient } from '../prisma-client.js';
import { toCreate, toDomain } from '../mappers/signal.mapper.js';

const keyParts = (key: string): { provider: string; externalId: string } => {
  const index = key.indexOf(':');
  return { provider: key.slice(0, index), externalId: key.slice(index + 1) };
};

/**
 * The (provider, externalId) key is what makes every connector safely re-runnable: a sync that
 * overlaps its own window produces no duplicate loops.
 *
 * It used to skip a key it already held, which quietly meant a signal was whatever it looked
 * like the first time anybody fetched it. Upstream edits never landed, and neither did a fix to
 * the code that read it — a Notion page whose title we had been failing to find stayed titled
 * "Item" through every later sweep. So a row whose content actually differs is rewritten and
 * marked unprocessed, and re-reading it is what lets the loop catch up.
 */
export class PrismaSignalStore implements SignalStore {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly ownerId: string,
  ) {}

  public async append(signals: readonly Signal[]): Promise<number> {
    if (signals.length === 0) return 0;
    const result = await this.prisma.rawSignal.createMany({
      data: signals.map((signal) => ({ ...toCreate(signal), ownerId: this.ownerId })),
      skipDuplicates: true,
    });
    return result.count + (await this.refreshChanged(signals));
  }

  /**
   * Rewrites the rows a connector re-fetched whose content has moved on, and only those: an
   * unchanged re-fetch must stay untouched, or every sweep would re-extract everything it has
   * ever seen and the model bill would be a function of history rather than of news.
   */
  private async refreshChanged(signals: readonly Signal[]): Promise<number> {
    const existing = await this.prisma.rawSignal.findMany({
      where: {
        ownerId: this.ownerId,
        OR: signals.map((signal) => ({
          provider: signal.provider,
          externalId: signal.externalId,
        })),
      },
    });
    const stored = new Map(existing.map((row) => [`${row.provider}:${row.externalId}`, row]));

    const changed = signals.filter((signal) => {
      const row = stored.get(`${signal.provider}:${signal.externalId}`);
      return row !== undefined && signalChanged(signal, { ...row, occurredAt: row.occurredAt.getTime() });
    });
    if (changed.length === 0) return 0;

    await this.prisma.$transaction(
      changed.map((signal) =>
        this.prisma.rawSignal.update({
          where: {
            ownerId_provider_externalId: {
              ownerId: this.ownerId,
              provider: signal.provider,
              externalId: signal.externalId,
            },
          },
          // Cleared so the next extract reads it again. Everything else about the row is
          // replaced, because the connector's version is the current truth about it.
          data: { ...toCreate(signal), processedAt: null },
        }),
      ),
    );
    return changed.length;
  }

  public async listUnprocessed(limit: number): Promise<readonly Signal[]> {
    const rows = await this.prisma.rawSignal.findMany({
      where: { ownerId: this.ownerId, processedAt: null },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  public async listRecent(input: { since: Instant; limit: number }): Promise<readonly Signal[]> {
    const rows = await this.prisma.rawSignal.findMany({
      where: { ownerId: this.ownerId, occurredAt: { gte: new Date(input.since) } },
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
        where: {
          ownerId: this.ownerId,
          provider,
          externalId: { in: externalIds },
          processedAt: null,
        },
        data: { processedAt: now },
      });
    }
  }

  public async pruneBefore(cutoff: Instant): Promise<number> {
    const result = await this.prisma.rawSignal.deleteMany({
      where: {
        ownerId: this.ownerId,
        occurredAt: { lt: new Date(cutoff) },
        processedAt: { not: null },
      },
    });
    return result.count;
  }
}

export class PrismaSyncCursorStore implements SyncCursorStore {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly ownerId: string,
  ) {}

  public async get(provider: string): Promise<Instant | undefined> {
    const row = await this.prisma.syncCursor.findUnique({
      where: { ownerId_provider: { ownerId: this.ownerId, provider } },
    });
    return row === null ? undefined : asInstant(row.at.getTime());
  }

  public async set(input: { provider: string; at: Instant }): Promise<void> {
    const at = new Date(input.at);
    await this.prisma.syncCursor.upsert({
      where: { ownerId_provider: { ownerId: this.ownerId, provider: input.provider } },
      create: { ownerId: this.ownerId, provider: input.provider, at },
      update: { at },
    });
  }
}
