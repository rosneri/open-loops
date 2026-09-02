import type { PluginRecord, PluginRecordStore } from '@open-loops/plugin-api';
import type { PrismaClient } from '../prisma-client.js';

/**
 * Built for one plugin and one person, exactly like every repository here is built for one
 * person. There is no method that takes an owner or a plugin id, so there is no query a plugin
 * could write that would reach somebody else's rows — the same enforcement-by-construction the
 * rest of the persistence layer uses, one level further in.
 */
export class PrismaPluginRecordStore implements PluginRecordStore {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly ownerId: string,
    private readonly pluginId: string,
  ) {}

  public async get<TValue>(
    collection: string,
    key: string,
  ): Promise<PluginRecord<TValue> | undefined> {
    const row = await this.prisma.pluginRecord.findUnique({
      where: { ownerId_pluginId_collection_key: { ...this.scope, collection, key } },
    });
    return row === null ? undefined : toRecord<TValue>(row);
  }

  public async put(collection: string, key: string, value: unknown): Promise<void> {
    const data = value as object;
    await this.prisma.pluginRecord.upsert({
      where: { ownerId_pluginId_collection_key: { ...this.scope, collection, key } },
      create: { ...this.scope, collection, key, value: data },
      update: { value: data },
    });
  }

  public async list<TValue>(
    collection: string,
    query?: { readonly prefix?: string; readonly limit?: number },
  ): Promise<readonly PluginRecord<TValue>[]> {
    const rows = await this.prisma.pluginRecord.findMany({
      where: {
        ...this.scope,
        collection,
        ...(query?.prefix === undefined ? {} : { key: { startsWith: query.prefix } }),
      },
      orderBy: { key: 'asc' },
      take: query?.limit ?? 100,
    });
    return rows.map((row) => toRecord<TValue>(row));
  }

  public async delete(collection: string, key: string): Promise<void> {
    await this.prisma.pluginRecord.deleteMany({ where: { ...this.scope, collection, key } });
  }

  private get scope(): { ownerId: string; pluginId: string } {
    return { ownerId: this.ownerId, pluginId: this.pluginId };
  }
}

const toRecord = <TValue>(row: {
  key: string;
  value: unknown;
  updatedAt: Date;
}): PluginRecord<TValue> => ({
  key: row.key,
  value: row.value as TValue,
  updatedAt: row.updatedAt.getTime(),
});
