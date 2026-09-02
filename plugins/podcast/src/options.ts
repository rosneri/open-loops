import { z } from 'zod';
import type { ElevenLabsConfig } from './elevenlabs/elevenlabs-podcast-generator.js';
import type { StudioVoices } from './studio/scripted-podcast-generator.js';

/**
 * The podcast's deployment configuration, read from the environment the plugin was handed at
 * boot. Its own schema rather than fields on the app's: a feature that can be removed by
 * deleting a directory cannot leave its variables behind in the core's config.
 */
const schema = z.object({
  /** Seeds the schedule row on a fresh account and is ignored afterwards. */
  PODCAST_CRON: z.string().default('0 7 * * *'),
  /**
   * `studio` runs podcastfy's pipeline in this process — the configured model writes a
   * two-speaker script and the free Edge Read Aloud voices speak it. No key, no ffmpeg, no
   * Python, no cost. `elevenlabs` swaps in that hosted service for anyone who prefers its
   * voices and has a key.
   */
  PODCAST_PROVIDER: z.enum(['studio', 'elevenlabs']).default('studio'),
  /** Edge voice names. `en-US-AndrewNeural` and `en-US-AvaNeural` are the conversational pair. */
  STUDIO_HOST_VOICE: z.string().default('en-US-AndrewNeural'),
  STUDIO_GUEST_VOICE: z.string().default('en-US-AvaNeural'),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL_ID: z.string().default('eleven_multilingual_v2'),
  /** ElevenLabs' stock "Adam" and "Rachel"; overridden per-episode from Settings. */
  ELEVENLABS_HOST_VOICE_ID: z.string().default('pNInz6obpgDQGcFmaJgB'),
  ELEVENLABS_GUEST_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  ELEVENLABS_TIMEOUT_MS: z.coerce.number().int().min(30_000).max(1_800_000).default(600_000),
  ELEVENLABS_POLL_MS: z.coerce.number().int().min(1_000).max(60_000).default(5_000),

  /** Set automatically when a Vercel Blob store is attached to the project. */
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  /** Where episodes are written when there is no blob store. Gitignored. */
  PODCAST_DIR: z.string().default('.podcasts'),
  /**
   * Set by Vercel on every function invocation. A function's filesystem does not outlive the
   * request, so on one of those the disk is not somewhere an episode can live.
   */
  VERCEL: z.string().optional(),
});

export interface PodcastOptions {
  readonly defaultCron: string;
  readonly provider: 'studio' | 'elevenlabs';
  readonly studio: StudioVoices;
  readonly elevenlabs: ElevenLabsConfig;
  readonly blobToken: string | undefined;
  readonly directory: string;
  /** Whether this process outlives a request, and therefore whether a directory means anything. */
  readonly longLived: boolean;
}

export const optionsFrom = (env: Readonly<Record<string, string | undefined>>): PodcastOptions => {
  const parsed = schema.parse(env);
  return {
    defaultCron: parsed.PODCAST_CRON,
    provider: parsed.PODCAST_PROVIDER,
    studio: { host: parsed.STUDIO_HOST_VOICE, guest: parsed.STUDIO_GUEST_VOICE },
    elevenlabs: {
      apiKey: parsed.ELEVENLABS_API_KEY,
      modelId: parsed.ELEVENLABS_MODEL_ID,
      hostVoiceId: parsed.ELEVENLABS_HOST_VOICE_ID,
      guestVoiceId: parsed.ELEVENLABS_GUEST_VOICE_ID,
      timeoutMs: parsed.ELEVENLABS_TIMEOUT_MS,
      pollIntervalMs: parsed.ELEVENLABS_POLL_MS,
    },
    blobToken: parsed.BLOB_READ_WRITE_TOKEN,
    directory: parsed.PODCAST_DIR,
    longLived: (parsed.VERCEL ?? '').length === 0,
  };
};
