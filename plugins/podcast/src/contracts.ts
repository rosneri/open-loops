import type { Episode } from './model/episode.js';

/** What the panel reads. Owned by the plugin because no other client has a reason to know it. */
export type EpisodeStatusDto = 'REQUESTED' | 'GENERATING' | 'READY' | 'FAILED';

export interface EpisodeDto {
  readonly id: string;
  readonly day: string;
  readonly status: EpisodeStatusDto;
  readonly title: string;
  readonly audioUrl?: string;
  readonly durationSeconds?: number;
  readonly error?: string;
  readonly requestedAt: number;
  readonly completedAt?: number;
}

export const PodcastRoutes = {
  episodes: '/api/podcast/episodes',
  generate: '/api/podcast/generate',
} as const;

export const toDto = (episode: Episode): EpisodeDto => {
  const props = episode.snapshot();
  return {
    id: props.id,
    day: props.day,
    status: props.status,
    title: props.title,
    requestedAt: props.requestedAt,
    ...(props.audioUrl === undefined ? {} : { audioUrl: props.audioUrl }),
    ...(props.durationSeconds === undefined ? {} : { durationSeconds: props.durationSeconds }),
    ...(props.error === undefined ? {} : { error: props.error }),
    ...(props.completedAt === undefined ? {} : { completedAt: props.completedAt }),
  };
};
