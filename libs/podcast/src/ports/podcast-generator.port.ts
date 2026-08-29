/**
 * The one thing this context asks of the outside world: turn a brief into audio. Deliberately
 * narrow, because the interesting choice — a hosted service today, a self-hosted podcastfy
 * container later — should be a swap of one adapter and nothing else.
 */
export interface PodcastRequest {
  readonly title: string;
  /** Plain prose. Adapters decide how to turn it into a script; this context does not care. */
  readonly brief: string;
  readonly language: string;
  readonly length: PodcastLength;
  readonly hostVoiceId?: string;
  readonly guestVoiceId?: string;
}

export type PodcastLength = 'short' | 'default' | 'long';

export interface GeneratedPodcast {
  readonly audio: Uint8Array;
  readonly contentType: string;
  readonly externalRef: string;
  readonly durationSeconds?: number;
}

export interface PodcastGenerator {
  /** Whether the adapter has everything it needs; false means "not configured", not "broken". */
  isConfigured(): boolean;
  generate(request: PodcastRequest): Promise<GeneratedPodcast>;
}
