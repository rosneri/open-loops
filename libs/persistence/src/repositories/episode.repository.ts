import type { DayKey } from '@open-loops/kernel';
import type { Episode, EpisodeRepository } from '@open-loops/podcast';
import type { PrismaClient } from '../prisma-client.js';
import { toDomain, toRow } from '../mappers/episode.mapper.js';

export class PrismaEpisodeRepository implements EpisodeRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly ownerId: string,
  ) {}

  public async findByDay(day: DayKey): Promise<Episode | undefined> {
    const row = await this.prisma.podcastEpisode.findUnique({
      where: { ownerId_day: { ownerId: this.ownerId, day } },
    });
    return row === null ? undefined : toDomain(row);
  }

  public async listRecent(limit: number): Promise<readonly Episode[]> {
    const rows = await this.prisma.podcastEpisode.findMany({
      where: { ownerId: this.ownerId },
      orderBy: { requestedAt: 'desc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  /** Keyed on owner and day, so re-running a day replaces that person's episode for it. */
  public async save(episode: Episode): Promise<void> {
    const { id, day, ...rest } = toRow(episode.snapshot());
    await this.prisma.podcastEpisode.upsert({
      where: { ownerId_day: { ownerId: this.ownerId, day } },
      create: { id, day, ownerId: this.ownerId, ...rest },
      update: rest,
    });
  }
}
