import type { DayKey, Instant } from '@open-loops/kernel';

/**
 * An episode is a small state machine, and the states are the ones a listener can tell apart:
 * we asked for it, it exists, or it did not work and here is why. Nothing else belongs here —
 * how the audio gets made is the generator's business, not the episode's.
 */
export const EpisodeStatus = {
  Requested: 'REQUESTED',
  Generating: 'GENERATING',
  Ready: 'READY',
  Failed: 'FAILED',
} as const;

export type EpisodeStatus = (typeof EpisodeStatus)[keyof typeof EpisodeStatus];

export interface EpisodeProps {
  readonly id: string;
  readonly day: DayKey;
  readonly status: EpisodeStatus;
  readonly title: string;
  /** The text the generator was asked to narrate. Kept so a bad episode can be explained. */
  readonly brief: string;
  readonly audioUrl?: string;
  readonly durationSeconds?: number;
  /** The provider's own handle for the job, for support questions and for resuming a poll. */
  readonly externalRef?: string;
  readonly error?: string;
  readonly requestedAt: Instant;
  readonly completedAt?: Instant;
}

export class Episode {
  private constructor(private props: EpisodeProps) {}

  public static requested(input: {
    id: string;
    day: DayKey;
    title: string;
    brief: string;
    at: Instant;
  }): Episode {
    return new Episode({
      id: input.id,
      day: input.day,
      status: EpisodeStatus.Requested,
      title: input.title,
      brief: input.brief,
      requestedAt: input.at,
    });
  }

  public static rehydrate(props: EpisodeProps): Episode {
    return new Episode(props);
  }

  public get id(): string {
    return this.props.id;
  }

  public get day(): DayKey {
    return this.props.day;
  }

  public snapshot(): EpisodeProps {
    return this.props;
  }

  public isPlayable(): boolean {
    return this.props.status === EpisodeStatus.Ready && this.props.audioUrl !== undefined;
  }

  /** The provider accepted the job. Recording its handle is what makes a resumed poll possible. */
  public accepted(externalRef: string): void {
    this.props = { ...this.props, status: EpisodeStatus.Generating, externalRef };
  }

  public ready(input: { audioUrl: string; durationSeconds?: number; at: Instant }): void {
    this.props = {
      ...this.props,
      status: EpisodeStatus.Ready,
      audioUrl: input.audioUrl,
      completedAt: input.at,
      ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds }),
    };
  }

  /**
   * A failure is recorded rather than thrown away: the settings screen shows the reason, and a
   * retry the next day should not have to rediscover that the API key is missing.
   */
  public failed(reason: string, at: Instant): void {
    this.props = { ...this.props, status: EpisodeStatus.Failed, error: reason, completedAt: at };
  }
}
