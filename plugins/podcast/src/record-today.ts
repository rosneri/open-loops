import type { Logger } from '@open-loops/kernel';
import type { StructuredGenerator } from '@open-loops/orchestration';
import type { OwnerScope } from '@open-loops/plugin-api';
import { ElevenLabsPodcastGenerator } from './elevenlabs/elevenlabs-podcast-generator.js';
import { RecordEpisodeRepository } from './episodes.store.js';
import {
  GenerateDailyPodcastUseCase,
  type GeneratePodcastResult,
} from './generate-daily-podcast.use-case.js';
import type { PodcastOptions } from './options.js';
import type { AudioStore } from './ports/audio-store.port.js';
import type { PodcastGenerator } from './ports/podcast-generator.port.js';
import type { PodcastSettings } from './settings.js';
import { BlobAudioStore } from './stores/blob-audio-store.js';
import { FileAudioStore } from './stores/file-audio-store.js';
import { EdgeSpeechSynthesizer } from './studio/edge-speech.js';
import { ScriptedPodcastGenerator } from './studio/scripted-podcast-generator.js';

/**
 * Blob when a token exists, disk otherwise — but only where a disk means anything. Falling back
 * to the filesystem is what lets a developer hear an episode without attaching a store first; on
 * a serverless function the same fallback writes to a read-only directory that would not outlive
 * the request, so there the answer is "no store", said out loud.
 */
export const audioStoreFor = (options: PodcastOptions): AudioStore =>
  (options.blobToken ?? '').length > 0 || !options.longLived
    ? new BlobAudioStore(options.blobToken)
    : new FileAudioStore(options.directory);

/**
 * The in-house studio by default: the model this deployment already pays for writes the script,
 * and the free Edge voices read it, so a daily episode costs nothing and needs no new account.
 * ElevenLabs is there for anyone who wants its voices and has a key.
 */
export const generatorFor = (input: {
  options: PodcastOptions;
  model: StructuredGenerator;
  logger: Logger;
}): PodcastGenerator =>
  input.options.provider === 'elevenlabs'
    ? new ElevenLabsPodcastGenerator(input.options.elevenlabs, input.logger)
    : new ScriptedPodcastGenerator({
        model: input.model,
        speech: new EdgeSpeechSynthesizer(),
        voices: input.options.studio,
        logger: input.logger,
      });

/**
 * Whether an episode can actually be produced *and* kept. The studio generator needs no key, so
 * it alone always says yes — and the Settings screen would offer a button that fails on the
 * write. Both halves have to be ready for the answer to be true.
 */
export const podcastAvailable = (options: PodcastOptions): boolean => {
  const generator =
    options.provider === 'elevenlabs' ? (options.elevenlabs.apiKey ?? '').length > 0 : true;
  return generator && audioStoreFor(options).isConfigured();
};

/** Records this person's day, or hands back the episode already recorded unless forced. */
export const recordToday = async (input: {
  scope: OwnerScope;
  options: PodcastOptions;
  force: boolean;
}): Promise<GeneratePodcastResult> => {
  const { scope, options } = input;
  const settings = await scope.settings<PodcastSettings>();

  const useCase = new GenerateDailyPodcastUseCase({
    ownerId: scope.ownerId,
    today: scope.today,
    episodes: new RecordEpisodeRepository(scope.storage),
    generator: generatorFor({ options, model: scope.reasoning, logger: scope.logger }),
    audio: audioStoreFor(options),
    clock: scope.clock,
    ids: scope.ids,
    logger: scope.logger,
  });

  return await useCase.execute({
    force: input.force,
    length: settings.length,
    ...(settings.hostVoiceId === undefined ? {} : { hostVoiceId: settings.hostVoiceId }),
    ...(settings.guestVoiceId === undefined ? {} : { guestVoiceId: settings.guestVoiceId }),
  });
};
