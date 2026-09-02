/**
 * A plugin's own rows, without a migration. Namespaced by plugin and by owner at the point of
 * construction rather than by a `where` clause someone has to remember, so one plugin cannot
 * read another's records and no plugin can read another account's.
 *
 * Structured data that the core reasons about still belongs in the schema. This is for what a
 * feature knows about itself.
 */
export interface PluginRecord<TValue = unknown> {
  readonly key: string;
  readonly value: TValue;
  readonly updatedAt: number;
}

export interface PluginRecordStore {
  get<TValue>(collection: string, key: string): Promise<PluginRecord<TValue> | undefined>;
  put(collection: string, key: string, value: unknown): Promise<void>;
  /** Ordered by key, ascending unless asked otherwise — a key that sorts is a key that lists. */
  list<TValue>(
    collection: string,
    query?: {
      readonly prefix?: string;
      readonly limit?: number;
      readonly order?: 'asc' | 'desc';
    },
  ): Promise<readonly PluginRecord<TValue>[]>;
  delete(collection: string, key: string): Promise<void>;
}
