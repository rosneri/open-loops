import { BadRequestException } from '@nestjs/common';
import type { PluginSettingsDto, UpdatePluginSettingsDto } from '@open-loops/contracts';
import { PLUGIN_SETTINGS_RECORD } from '@open-loops/plugin-api';
import type { PluginHost } from '@open-loops/plugin-host';
import { PrismaPluginRecordStore, type PrismaClient } from '@open-loops/persistence';

/**
 * Every plugin's slice of one person's settings, read and written through the fragment each
 * plugin registered. The schema is the whole contract: a value that does not parse is refused
 * here, and a value that does is stored exactly as parsed — defaults filled in — in that plugin's
 * own namespace, which is also where the plugin's scope reads it back from.
 */
export class PluginSettingsStore {
  public constructor(
    private readonly deps: { readonly host: PluginHost; readonly prisma: PrismaClient },
  ) {}

  public async view(ownerId: string): Promise<readonly PluginSettingsDto[]> {
    const views: PluginSettingsDto[] = [];
    for (const { pluginId, definition } of this.deps.host.settings()) {
      const row = await this.records(ownerId, pluginId).get(
        PLUGIN_SETTINGS_RECORD.collection,
        PLUGIN_SETTINGS_RECORD.key,
      );
      // Never saved is the common case: the plugin runs on its defaults until somebody disagrees.
      views.push({ id: pluginId, label: definition.label, value: row?.value ?? definition.defaults });
    }
    return views;
  }

  public async save(ownerId: string, entries: readonly UpdatePluginSettingsDto[]): Promise<void> {
    for (const entry of entries) {
      const fragment = this.deps.host.settings().find((f) => f.pluginId === entry.id);
      // A plugin nothing installed is silently skipped rather than stored, exactly like a
      // schedule for one: its row would come back to life the day a different build ships.
      if (fragment === undefined) continue;

      const parsed = fragment.definition.schema.safeParse(entry.value);
      if (!parsed.success) {
        const reasons = parsed.error.issues.map((issue) => issue.message).join('; ');
        throw new BadRequestException(`${entry.id} settings are invalid: ${reasons}`);
      }
      await this.records(ownerId, entry.id).put(
        PLUGIN_SETTINGS_RECORD.collection,
        PLUGIN_SETTINGS_RECORD.key,
        parsed.data,
      );
    }
  }

  private records(ownerId: string, pluginId: string): PrismaPluginRecordStore {
    return new PrismaPluginRecordStore(this.deps.prisma, ownerId, pluginId);
  }
}
