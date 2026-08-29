import type { Instant } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type { BusyInterval, BusyTimeProvider } from '@open-loops/planning';
import { SignalKind } from '@open-loops/signals';
import type { PrismaClient } from '../prisma-client.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MEETING_MS = 30 * 60 * 1000;

/**
 * Busy time is read from the calendar signals already in the store rather than from a second
 * live integration: one ingestion path, one source of truth, identical in local and hosted mode.
 */
export class SignalBusyTimeProvider implements BusyTimeProvider {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly ownerId: string,
  ) {}

  public async listBusy(input: { dayStartAt: Instant }): Promise<readonly BusyInterval[]> {
    const rows = await this.prisma.rawSignal.findMany({
      where: {
        ownerId: this.ownerId,
        kind: SignalKind.CalendarEvent,
        occurredAt: { gte: new Date(input.dayStartAt), lt: new Date(input.dayStartAt + DAY_MS) },
      },
      orderBy: { occurredAt: 'asc' },
    });

    return rows.map((row) => {
      const startAt = asInstant(row.occurredAt.getTime());
      const endsAt = (row.metadata as Record<string, unknown> | null)?.['endsAt'];
      return {
        startAt,
        endAt: asInstant(typeof endsAt === 'number' ? endsAt : startAt + DEFAULT_MEETING_MS),
        label: row.title,
      };
    });
  }
}
