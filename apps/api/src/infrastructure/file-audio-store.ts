import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { AudioStore, StoredAudio } from '@open-loops/podcast';

/**
 * Where episodes go when there is no blob store: a directory on disk, served back by the API.
 * A serverless function cannot use this — its filesystem does not outlive the request — which
 * is exactly why the blob store is preferred whenever its token is present.
 */
export class FileAudioStore implements AudioStore {
  public constructor(private readonly directory: string) {}

  public isConfigured(): boolean {
    return true;
  }

  public async put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredAudio> {
    // The key is flattened to a single filename, so a key containing `../` cannot escape the
    // directory and the serving route can stay a simple lookup.
    const name = basename(input.key);
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(resolve(this.directory), name), input.body);
    return { url: `/api/podcast/audio/${name}` };
  }
}
