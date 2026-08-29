import type { Logger } from '@open-loops/kernel';
import type {
  GeneratedPodcast,
  PodcastGenerator,
  PodcastRequest,
} from '@open-loops/podcast';
import type { StructuredGenerator } from '@open-loops/reasoning';
import { concat, estimateSeconds, type SpeechSynthesizer } from './edge-speech.js';
import { writeTranscript } from './transcript.js';

export interface StudioVoices {
  readonly host: string;
  readonly guest: string;
}

/**
 * podcastfy's pipeline, in process: the model writes a two-speaker script, each turn is spoken
 * in that speaker's voice, and the turns are joined into one file. Doing it here rather than
 * shelling out to the Python package is what lets the whole thing run inside the same bundle
 * as the rest of the API — no container, no ffmpeg, no second runtime.
 *
 * It also costs nothing: the script comes from the model this deployment already uses, and the
 * voices are the free Edge Read Aloud service.
 */
export class ScriptedPodcastGenerator implements PodcastGenerator {
  public constructor(
    private readonly deps: {
      readonly model: StructuredGenerator;
      readonly speech: SpeechSynthesizer;
      readonly voices: StudioVoices;
      readonly logger: Logger;
    },
  ) {}

  /** Always: there is no key to be missing, which is the point of this adapter. */
  public isConfigured(): boolean {
    return true;
  }

  public async generate(request: PodcastRequest): Promise<GeneratedPodcast> {
    const transcript = await writeTranscript({
      generator: this.deps.model,
      brief: request.brief,
      length: request.length,
    });
    this.deps.logger.info('podcast script written', { turns: transcript.lines.length });

    const host = request.hostVoiceId ?? this.deps.voices.host;
    const guest = request.guestVoiceId ?? this.deps.voices.guest;

    // Sequential on purpose. The service throttles parallel sessions from one address, and a
    // failure halfway through a burst is harder to reason about than a slower, ordered read.
    const spoken: Uint8Array[] = [];
    for (const line of transcript.lines) {
      spoken.push(
        await this.deps.speech.speak({
          voice: line.speaker === 'HOST' ? host : guest,
          text: line.text,
        }),
      );
    }

    const audio = concat(spoken);
    this.deps.logger.info('podcast recorded', {
      bytes: audio.length,
      seconds: estimateSeconds(audio),
    });

    return {
      audio,
      contentType: 'audio/mpeg',
      externalRef: `studio:${String(transcript.lines.length)}-turns`,
      durationSeconds: estimateSeconds(audio),
    };
  }
}
