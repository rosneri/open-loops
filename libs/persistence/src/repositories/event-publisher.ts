import type { LoopEvent, LoopEventPublisher } from '@open-loops/loops';
import type { PrismaClient } from '../prisma-client.js';
import { toJson } from '../mappers/primitives.js';

/** An append-only log. The timeline reads from it, and any future outbox would too. */
export class PrismaLoopEventPublisher implements LoopEventPublisher {
  public constructor(private readonly prisma: PrismaClient) {}

  public async publish(events: readonly LoopEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.prisma.loopEventLog.createMany({
      data: events.map((event) => ({
        loopId: event.loopId,
        type: event.type,
        at: new Date(event.at),
        payload: toJson(event),
      })),
    });
  }
}
