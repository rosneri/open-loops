import { describe, expect, it, vi } from 'vitest';
import { asDayKey, asInstant, type Clock, type Instant } from '@open-loops/kernel';
import type { TodayDto } from '@open-loops/contracts';
import type {
  AudioStore,
  Episode,
  EpisodeRepository,
  GeneratedPodcast,
  PodcastGenerator,
  PodcastRequest,
} from '@open-loops/podcast';
import { GenerateDailyPodcastUseCase } from './generate-daily-podcast.use-case.js';
import type { TodayViewQuery } from '../queries/today-view.query.js';

const NOW = asInstant(1_700_000_000_000);

const clock: Clock = {
  now: (): Instant => NOW,
  startOfDay: (): Instant => NOW,
  dayKey: () => asDayKey('2026-08-29'),
};

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const view = (overrides: Partial<TodayDto> = {}): TodayDto => ({
  day: '2026-08-29',
  now: NOW,
  timeZone: 'Asia/Jerusalem',
  windowStartAt: NOW,
  windowEndAt: NOW,
  items: [],
  counts: { OPEN: 0, IN_PROGRESS: 0, DONE_UNCONFIRMED: 0, DONE: 0, SNOOZED: 0, DROPPED: 0 },
  ...overrides,
});

const loop = (overrides: Record<string, unknown> = {}): never =>
  ({
    id: 'loop-1',
    title: 'Open the rate limiter PR',
    summary: 'Told Dana it would be up today.',
    kind: 'COMMITMENT',
    status: 'OPEN',
    provider: 'SLACK',
    progress: 0,
    estimateMinutes: 45,
    slipCount: 0,
    isOverdue: false,
    criteria: [],
    counterparty: 'Dana',
    ...overrides,
  }) as never;

const repository = (stored?: Episode): EpisodeRepository & { saved: Episode[] } => {
  const saved: Episode[] = [];
  return {
    saved,
    findByDay: async () => await Promise.resolve(stored),
    listRecent: async () => await Promise.resolve([]),
    save: async (episode) => {
      saved.push(episode);
      await Promise.resolve();
    },
  };
};

const audio: AudioStore = {
  isConfigured: () => true,
  put: async () => await Promise.resolve({ url: 'https://blob.example/podcast/2026-08-29.mp3' }),
};

const generator = (
  onGenerate: (request: PodcastRequest) => Promise<GeneratedPodcast>,
): PodcastGenerator => ({
  isConfigured: () => true,
  generate: onGenerate,
});

const build = (input: {
  today: TodayDto;
  episodes: EpisodeRepository;
  generator: PodcastGenerator;
}): GenerateDailyPodcastUseCase =>
  new GenerateDailyPodcastUseCase({
    today: { execute: async () => await Promise.resolve(input.today) } as TodayViewQuery,
    episodes: input.episodes,
    generator: input.generator,
    audio,
    clock,
    ids: { next: () => 'episode-1' },
    logger,
  });

describe('GenerateDailyPodcastUseCase', () => {
  it('names the loops in the brief, so the hosts have something concrete to say', async () => {
    let seen: PodcastRequest | undefined;
    const episodes = repository();
    const result = await build({
      today: view({ items: [loop()], counts: { OPEN: 1, IN_PROGRESS: 0, DONE_UNCONFIRMED: 0, DONE: 0, SNOOZED: 0, DROPPED: 0 } }),
      episodes,
      generator: generator(async (request) => {
        seen = request;
        return await Promise.resolve({
          audio: new Uint8Array([1, 2, 3]),
          contentType: 'audio/mpeg',
          externalRef: 'project-1',
        });
      }),
    }).execute({ length: 'default' });

    expect(seen?.brief).toContain('Open the rate limiter PR');
    expect(seen?.brief).toContain('Dana');
    expect(seen?.brief).toContain('1 open loop');
    // The count helper only ever pluralises a real noun; the other two are phrases.
    expect(seen?.brief).not.toContain('in progresss');
    expect(seen?.brief).toContain('0 in progress');
    expect(result.audioUrl).toBe('https://blob.example/podcast/2026-08-29.mp3');
  });

  /** The state this product is built around deserves its own paragraph in the brief. */
  it('calls out work that is done but unconfirmed', async () => {
    let seen: PodcastRequest | undefined;
    await build({
      today: view({ items: [loop({ status: 'DONE_UNCONFIRMED' })] }),
      episodes: repository(),
      generator: generator(async (request) => {
        seen = request;
        return await Promise.resolve({
          audio: new Uint8Array([1]),
          contentType: 'audio/mpeg',
          externalRef: 'p',
        });
      }),
    }).execute({ length: 'short' });

    expect(seen?.brief).toContain('Done but nobody was told');
  });

  it('records the reason when the provider fails instead of losing it', async () => {
    const episodes = repository();
    const result = await build({
      today: view(),
      episodes,
      generator: generator(async () => await Promise.reject(new Error('no api key'))),
    }).execute({ length: 'default' });

    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('no api key');
    expect(episodes.saved.at(-1)?.snapshot().error).toBe('no api key');
  });

  it('leaves a day that already has audio alone unless forced', async () => {
    const ready = (await import('@open-loops/podcast')).Episode.rehydrate({
      id: 'episode-0',
      day: asDayKey('2026-08-29'),
      status: 'READY',
      title: 'Open Loops — 2026-08-29',
      brief: 'old',
      audioUrl: 'https://blob.example/old.mp3',
      requestedAt: NOW,
    });
    const generate = vi.fn();

    const result = await build({
      today: view(),
      episodes: repository(ready),
      generator: generator(generate),
    }).execute({ length: 'default' });

    expect(generate).not.toHaveBeenCalled();
    expect(result.audioUrl).toBe('https://blob.example/old.mp3');
  });
});
