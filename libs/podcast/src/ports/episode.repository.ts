import type { DayKey } from '@open-loops/kernel';
import type { Episode } from '../model/episode.js';

export interface EpisodeRepository {
  findByDay(day: DayKey): Promise<Episode | undefined>;
  listRecent(limit: number): Promise<readonly Episode[]>;
  save(episode: Episode): Promise<void>;
}
