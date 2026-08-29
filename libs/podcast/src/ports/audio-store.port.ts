/**
 * Where the finished audio goes. Separate from the generator because the two answers move
 * independently: the voice can change without changing where the file lives, and the other
 * way round.
 */
export interface StoredAudio {
  readonly url: string;
}

export interface AudioStore {
  isConfigured(): boolean;
  put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredAudio>;
}
