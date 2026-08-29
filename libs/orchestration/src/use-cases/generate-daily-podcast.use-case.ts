import type { Clock, IdGenerator, Logger } from '@open-loops/kernel';
import { asDayKey } from '@open-loops/kernel';
import type { LoopDto, TodayDto } from '@open-loops/contracts';
import type {
  AudioStore,
  EpisodeRepository,
  PodcastGenerator,
  PodcastLength,
} from '@open-loops/podcast';
import { Episode } from '@open-loops/podcast';
import type { TodayViewQuery } from '../queries/today-view.query.js';

export interface GenerateDailyPodcastDeps {
  readonly today: TodayViewQuery;
  readonly episodes: EpisodeRepository;
  readonly generator: PodcastGenerator;
  readonly audio: AudioStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

export interface GeneratePodcastOptions {
  readonly length: PodcastLength;
  readonly hostVoiceId?: string;
  readonly guestVoiceId?: string;
  /** A day already recorded is left alone unless the caller says otherwise. */
  readonly force?: boolean;
}

export interface GeneratePodcastResult {
  readonly day: string;
  readonly status: string;
  readonly audioUrl?: string;
  readonly error?: string;
}

/**
 * The day, read aloud. Everything interesting is in the brief: the generator only decides how
 * two voices say it, so the quality of an episode is the quality of what we hand over.
 *
 * The episode row is written before the audio exists and again after, so a run that dies
 * mid-generation leaves a FAILED episode with a reason rather than nothing at all.
 */
export class GenerateDailyPodcastUseCase {
  public constructor(private readonly deps: GenerateDailyPodcastDeps) {}

  public async execute(options: GeneratePodcastOptions): Promise<GeneratePodcastResult> {
    const view = await this.deps.today.execute();
    const day = asDayKey(view.day);
    const existing = await this.deps.episodes.findByDay(day);

    if (existing?.isPlayable() === true && options.force !== true) {
      const snapshot = existing.snapshot();
      this.deps.logger.info('podcast already recorded', { day: view.day });
      return { day: view.day, status: snapshot.status, ...opt('audioUrl', snapshot.audioUrl) };
    }

    const brief = writeBrief(view);
    const episode = Episode.requested({
      id: existing?.snapshot().id ?? this.deps.ids.next(),
      day,
      title: `Open Loops — ${view.day}`,
      brief,
      at: this.deps.clock.now(),
    });
    await this.deps.episodes.save(episode);

    try {
      const generated = await this.deps.generator.generate({
        title: episode.snapshot().title,
        brief,
        language: 'en',
        length: options.length,
        ...opt('hostVoiceId', options.hostVoiceId),
        ...opt('guestVoiceId', options.guestVoiceId),
      });
      episode.accepted(generated.externalRef);

      const stored = await this.deps.audio.put({
        key: `podcast/${view.day}.mp3`,
        body: generated.audio,
        contentType: generated.contentType,
      });
      episode.ready({
        audioUrl: stored.url,
        at: this.deps.clock.now(),
        ...opt('durationSeconds', generated.durationSeconds),
      });
      await this.deps.episodes.save(episode);

      this.deps.logger.info('podcast ready', { day: view.day, url: stored.url });
      return { day: view.day, status: episode.snapshot().status, audioUrl: stored.url };
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      episode.failed(reason, this.deps.clock.now());
      await this.deps.episodes.save(episode);
      this.deps.logger.error('podcast failed', { day: view.day, error: reason });
      return { day: view.day, status: episode.snapshot().status, error: reason };
    }
  }
}

/**
 * Prose, not JSON. The generator is a language model reading a document out loud, and it does
 * markedly better with sentences than with a serialised object — and a human can read the same
 * text back to check what the episode was actually told.
 */
const writeBrief = (view: TodayDto): string => {
  const planned = view.items.filter((item) => item.disposition !== 'DEFERRED');
  const deferred = view.items.filter((item) => item.disposition === 'DEFERRED');
  const overdue = view.items.filter((item) => item.isOverdue);
  const unconfirmed = view.items.filter((item) => item.status === 'DONE_UNCONFIRMED');

  const lines: string[] = [
    `Daily briefing for ${view.day}.`,
    '',
    `There are ${count(view.counts.OPEN, 'open loop')}. ` +
      `${String(view.counts.IN_PROGRESS)} in progress, and ` +
      `${String(view.counts.DONE_UNCONFIRMED)} finished but not yet confirmed.`,
    '',
  ];

  if (planned.length > 0) {
    lines.push("Today's plan:", '');
    for (const item of planned) lines.push(describe(item));
    lines.push('');
  }

  if (unconfirmed.length > 0) {
    lines.push(
      'Done but nobody was told — these look finished, but the person waiting has not heard back:',
      '',
    );
    for (const item of unconfirmed) lines.push(describe(item));
    lines.push('');
  }

  if (overdue.length > 0) {
    lines.push('Past due:', '');
    for (const item of overdue) lines.push(describe(item));
    lines.push('');
  }

  if (deferred.length > 0) {
    lines.push(`${count(deferred.length, 'loop')} did not fit today and slid to another day:`, '');
    for (const item of deferred) lines.push(describe(item));
    lines.push('');
  }

  if (view.items.length === 0) {
    lines.push('Nothing is open. There is genuinely nothing to chase today.');
  }

  return lines.join('\n');
};

const describe = (item: LoopDto): string => {
  const who = item.counterparty === undefined ? '' : ` for ${item.counterparty}`;
  const slipped = item.slipCount > 0 ? `, slipped ${count(item.slipCount, 'time')}` : '';
  const estimate = `${String(item.estimateMinutes)} minutes`;
  return `- ${item.title}${who}. From ${item.provider.toLowerCase()}, ${estimate}${slipped}. ${item.summary}`;
};

const count = (value: number, noun: string): string =>
  `${String(value)} ${noun}${value === 1 ? '' : 's'}`;

const opt = <TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined,
): Record<TKey, TValue> | Record<string, never> =>
  value === undefined ? {} : ({ [key]: value } as Record<TKey, TValue>);
