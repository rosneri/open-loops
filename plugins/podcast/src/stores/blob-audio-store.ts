import { put } from '@vercel/blob';
import type { AudioStore, StoredAudio } from '../ports/audio-store.port.js';

/**
 * Vercel Blob. The episode has to be playable from the deployed client, which rules out the
 * function's own filesystem — it is ephemeral and per-invocation. `access: 'public'` because
 * the URL is unguessable and the alternative is proxying every byte back through the API.
 */
export class BlobAudioStore implements AudioStore {
  public constructor(private readonly token: string | undefined) {}

  public isConfigured(): boolean {
    return (this.token ?? '').length > 0;
  }

  public async put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredAudio> {
    if (!this.isConfigured()) {
      throw new Error('BLOB_READ_WRITE_TOKEN is not set, so the episode has nowhere to live.');
    }

    const result = await put(input.key, Buffer.from(input.body), {
      access: 'public',
      contentType: input.contentType,
      // Narrowed by `isConfigured` above; `put` types the token as required.
      token: this.token ?? '',
      // A day is regenerated in place rather than accumulating suffixed copies.
      allowOverwrite: true,
      addRandomSuffix: false,
    });
    return { url: result.url };
  }
}
