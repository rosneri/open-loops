import { asDayKey, type DayKey } from '@open-loops/kernel';
import type { PluginRecordStore } from '@open-loops/plugin-api';
import { Episode, type EpisodeProps } from './model/episode.js';
import type { EpisodeRepository } from './ports/episode.repository.js';

const COLLECTION = 'episodes';

/**
 * Episodes live in the plugin's own records rather than in a table of their own: what a feature
 * knows about itself belongs to the feature. The store is already bound to one owner, so there
 * is no query here that could reach another person's day — and the key is the day, which is
 * also why re-recording a day replaces it.
 */
export class RecordEpisodeRepository implements EpisodeRepository {
  public constructor(private readonly records: PluginRecordStore) {}

  public async findByDay(day: DayKey): Promise<Episode | undefined> {
    const row = await this.records.get<EpisodeProps>(COLLECTION, day);
    return row === undefined ? undefined : rehydrate(row.value);
  }

  /** Day keys sort as dates, so descending key order is most recent first. */
  public async listRecent(limit: number): Promise<readonly Episode[]> {
    const rows = await this.records.list<EpisodeProps>(COLLECTION, { limit, order: 'desc' });
    return rows.map((row) => rehydrate(row.value));
  }

  public async save(episode: Episode): Promise<void> {
    await this.records.put(COLLECTION, episode.day, episode.snapshot());
  }
}

/** Rows written by the migration carry the same shape; the brand on `day` is re-applied here. */
const rehydrate = (props: EpisodeProps): Episode =>
  Episode.rehydrate({ ...props, day: asDayKey(props.day) });
