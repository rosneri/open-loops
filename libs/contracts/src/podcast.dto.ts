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
