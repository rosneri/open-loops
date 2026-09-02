import { describe, expect, it } from 'vitest';
import { asDayKey, asInstant } from '@open-loops/kernel';
import type { PluginRecord, PluginRecordStore } from '@open-loops/plugin-api';
import { RecordEpisodeRepository } from './episodes.store.js';
import { Episode } from './model/episode.js';

/** Just enough of the record store to exercise ordering and replacement. */
const memory = (): PluginRecordStore => {
  const rows = new Map<string, PluginRecord>();
  const id = (collection: string, key: string): string => `${collection}/${key}`;
  return {
    get: async <TValue>(collection: string, key: string) =>
      await Promise.resolve(rows.get(id(collection, key)) as PluginRecord<TValue> | undefined),
    put: async (collection, key, value) => {
      rows.set(id(collection, key), { key, value, updatedAt: 0 });
      await Promise.resolve();
    },
    list: async <TValue>(
      collection: string,
      query?: { readonly prefix?: string; readonly limit?: number; readonly order?: 'asc' | 'desc' },
    ) => {
      const matching = [...rows.entries()]
        .filter(([stored]) => stored.startsWith(`${collection}/`))
        .map(([, row]) => row as PluginRecord<TValue>)
        .sort((a, b) => a.key.localeCompare(b.key));
      if (query?.order === 'desc') matching.reverse();
      return await Promise.resolve(matching.slice(0, query?.limit ?? 100));
    },
    delete: async (collection, key) => {
      rows.delete(id(collection, key));
      await Promise.resolve();
    },
  };
};

const episode = (day: string): Episode =>
  Episode.requested({
    id: `episode-${day}`,
    day: asDayKey(day),
    title: `Open Loops — ${day}`,
    brief: 'nothing much',
    at: asInstant(1_700_000_000_000),
  });

describe('RecordEpisodeRepository', () => {
  it('finds an episode by its day and lists the most recent first', async () => {
    const episodes = new RecordEpisodeRepository(memory());
    for (const day of ['2026-08-30', '2026-09-01', '2026-08-31']) await episodes.save(episode(day));

    expect((await episodes.findByDay(asDayKey('2026-08-31')))?.id).toBe('episode-2026-08-31');
    expect((await episodes.listRecent(2)).map((found) => found.day)).toEqual([
      '2026-09-01',
      '2026-08-31',
    ]);
  });

  it('replaces a day that is recorded again rather than keeping two', async () => {
    const store = memory();
    const episodes = new RecordEpisodeRepository(store);
    const first = episode('2026-09-02');
    await episodes.save(first);
    first.failed('no voice', asInstant(1_700_000_001_000));
    await episodes.save(first);

    const found = await episodes.findByDay(asDayKey('2026-09-02'));
    expect(found?.snapshot().status).toBe('FAILED');
    expect(await episodes.listRecent(10)).toHaveLength(1);
  });

  /** Rows the migration wrote carry a plain string for the day; the brand is put back on read. */
  it('rehydrates what the migration wrote', async () => {
    const store = memory();
    await store.put('episodes', '2026-08-29', {
      id: 'old',
      day: '2026-08-29',
      status: 'READY',
      title: 'Open Loops — 2026-08-29',
      brief: 'brief',
      audioUrl: 'https://blob/old.mp3',
      requestedAt: 1,
    });
    const found = await new RecordEpisodeRepository(store).findByDay(asDayKey('2026-08-29'));
    expect(found?.isPlayable()).toBe(true);
  });
});
