import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

/**
 * The second half of what podcastfy does. It reaches for the same free service podcastfy's
 * default backend uses — the voice behind Edge's Read Aloud — which needs no API key and no
 * account, and so costs nothing to run every morning.
 *
 * One connection per turn rather than one for the whole script: the service ends a session
 * after a single synthesis, and a turn is small enough that the handshake is not the slow part.
 */
export interface SpeechSynthesizer {
  speak(input: { voice: string; text: string }): Promise<Uint8Array>;
}

export class EdgeSpeechSynthesizer implements SpeechSynthesizer {
  public async speak(input: { voice: string; text: string }): Promise<Uint8Array> {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(input.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    // `toStream` hands back the stream synchronously; only the metadata call is async.
    const { audioStream } = tts.toStream(input.text);
    const chunks: Uint8Array[] = [];
    for await (const chunk of audioStream) chunks.push(chunk as Uint8Array);

    return concat(chunks);
  }
}

/**
 * MP3 is a stream of self-describing frames, so joining two files of the same sample rate and
 * bitrate produces a file that plays as one — which is why this needs no ffmpeg. It is also
 * why every turn must be synthesised at the same output format.
 */
export const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);

  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
};

/**
 * A rough duration from the file size. At a constant 48 kbit/s this is exact enough for a
 * progress bar, and the alternative is parsing frame headers for a number nothing depends on.
 */
const BYTES_PER_SECOND = 48_000 / 8;

export const estimateSeconds = (audio: Uint8Array): number =>
  Math.round(audio.length / BYTES_PER_SECOND);
