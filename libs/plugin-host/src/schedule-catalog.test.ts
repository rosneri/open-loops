import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@open-loops/kernel';
import { Capability, definePlugin, type OwnerScope, type Plugin } from '@open-loops/plugin-api';
import { PluginHost } from './plugin-host.js';
import { ScheduleCatalog } from './schedule-catalog.js';

const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const load = async (plugins: readonly Plugin[]): Promise<PluginHost> =>
  await PluginHost.load({ plugins, logger, env: {} });

const digest = (overrides: { kind?: string; ran?: string[] } = {}): Plugin =>
  definePlugin({
    id: 'digest',
    version: '1.0.0',
    description: 'a daily summary',
    capabilities: [Capability.Schedule],
    setup: (context) => {
      context.schedules.register({
        kind: overrides.kind ?? 'digest',
        label: 'Digest',
        description: 'Sends the day as an email.',
        defaultCron: '0 18 * * *',
        run: async (scope) => {
          overrides.ran?.push(scope.ownerId);
          await Promise.resolve();
        },
      });
    },
  });

describe('ScheduleCatalog', () => {
  it('runs a plugin schedule against the scope of the plugin that registered it', async () => {
    const ran: string[] = [];
    const catalog = ScheduleCatalog.from(await load([digest({ ran })]));

    const asked: string[] = [];
    const [kind] = catalog.kinds((pluginId) => {
      asked.push(pluginId);
      return { ownerId: 'neri' } as OwnerScope;
    });

    await kind?.run();
    expect(asked).toEqual(['digest']);
    expect(ran).toEqual(['neri']);
  });

  it('defaults an unstated schedule to enabled and available', async () => {
    const catalog = ScheduleCatalog.from(await load([digest()]));
    const [kind] = catalog.kinds(() => ({}) as OwnerScope);

    expect(kind?.enabledByDefault).toBe(true);
    expect(kind?.available()).toBe(true);
    expect(kind?.defaultCron).toBe('0 18 * * *');
  });

  it('refuses two plugins that would both own one kind of work', async () => {
    const other = definePlugin({
      ...digest(),
      id: 'summary',
    });

    const both = await load([digest(), other]);
    expect(() => ScheduleCatalog.from(both)).toThrow(
      /Schedule 'digest' is registered by both 'digest' and 'summary'/,
    );
  });
});
