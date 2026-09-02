/**
 * Where the finished audio goes. Separate from the generator because the two answers move
 * independently: the voice can change without changing where the file lives, and the other
 * way round.
 */
export interface StoredAudio {
  readonly url: string;
}

/**
 * Where one account's episode for one day lives. The owner is in the key rather than only in the
 * database row: two people recording the same day would otherwise write the same object, and the
 * second one would quietly hand the first one's audio to both.
 */
export const audioKeyFor = (input: { ownerId: string; day: string }): string =>
  `podcast/${input.ownerId}/${input.day}.mp3`;

/**
 * A key is a path, and a filesystem store needs a single name it can serve back by lookup.
 * Flattening rather than taking the last segment is what keeps the owner in the name — with
 * `basename`, every account's episode for a day would land on the same file.
 */
export const audioFileNameFor = (key: string): string => key.replaceAll('/', '~');

/** What every one of this account's audio file names begins with, and nobody else's does. */
export const audioFilePrefixFor = (ownerId: string): string =>
  audioFileNameFor(`podcast/${ownerId}/`);

export interface AudioStore {
  isConfigured(): boolean;
  put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredAudio>;
}
