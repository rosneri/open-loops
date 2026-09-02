import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@open-loops/kernel';
import { LoopEventType, type LoopEvent } from '@open-loops/loops';
import { Capability, definePlugin, type OwnerScope, type Plugin } from '@open-loops/plugin-api';
import { PluginHost } from './plugin-host.js';

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const load = async (plugins: readonly Plugin[]): Promise<PluginHost> =>
  await PluginHost.load({ plugins, logger, env: {} });

const created: LoopEvent = {
  type: LoopEventType.Created,
  loopId: 'loop-1' as LoopEvent['loopId'],
  at: 0 as unknown as LoopEvent['at'],
  title: 'ship it',
};

describe('PluginHost', () => {
  it('sets a plugin up after everything it requires', async () => {
    const order: string[] = [];
    const host = await load([
      definePlugin({
        id: 'podcast',
        version: '1.0.0',
        description: 'reads the day aloud',
        requires: ['reasoning'],
        capabilities: [],
        setup: () => {
          order.push('podcast');
        },
      }),
      definePlugin({
        id: 'reasoning',
        version: '1.0.0',
        description: 'the thinking',
        capabilities: [],
        setup: () => {
          order.push('reasoning');
        },
      }),
    ]);

    expect(order).toEqual(['reasoning', 'podcast']);
    expect(host.list().map((plugin) => plugin.id)).toEqual(['reasoning', 'podcast']);
  });

  it('refuses to boot when a plugin registers something it never asked for', async () => {
    const sneaky = definePlugin({
      id: 'sneaky',
      version: '1.0.0',
      description: 'wants routes it did not declare',
      capabilities: [Capability.Settings],
      setup: (context) => {
        context.http.register({ basePath: 'api/sneaky', controllers: [] });
      },
    });

    await expect(load([sneaky])).rejects.toThrow(
      /\[plugin:sneaky\] does not declare the 'http' capability/,
    );
  });

  it('lets a plugin register what it did declare', async () => {
    const host = await load([
      definePlugin({
        id: 'github',
        version: '1.0.0',
        description: 'pull requests',
        capabilities: [Capability.RunProbes],
        setup: (context) => {
          context.probes.register({
            kind: 'PULL_REQUEST_EXISTS',
            prompt: 'use when a PR is the deliverable',
            build: (draft) =>
              draft.target === undefined ? undefined : { repository: draft.target },
          });
        },
      }),
    ]);

    expect(host.probe('PULL_REQUEST_EXISTS')?.kind).toBe('PULL_REQUEST_EXISTS');
    expect(host.probe('ISSUE_CLOSED')).toBeUndefined();
  });

  it('orders tick steps by what they declared, not by who loaded first', async () => {
    const host = await load([
      definePlugin({
        id: 'late',
        version: '1.0.0',
        description: 'runs after extraction',
        capabilities: [Capability.Tick],
        setup: (context) => {
          context.tick.register({
            name: 'reconcile',
            after: ['extract'],
            run: () => Promise.resolve(undefined),
          });
          context.tick.register({
            name: 'extract',
            run: () => Promise.resolve(undefined),
          });
        },
      }),
    ]);

    const scope = (): OwnerScope => ({}) as OwnerScope;
    expect(host.tickSteps(scope).map((step) => step.name)).toEqual(['extract', 'reconcile']);
  });

  it('tells a plugin what else is loaded so an optional integration can stand down', async () => {
    let sawPodcast: boolean | undefined;
    await load([
      definePlugin({
        id: 'podcast',
        version: '1.0.0',
        description: 'reads the day aloud',
        capabilities: [],
        setup: () => {
          /* nothing to register; it exists so `digest` can find it */
        },
      }),
      definePlugin({
        id: 'digest',
        version: '1.0.0',
        description: 'summarises',
        requires: ['podcast'],
        capabilities: [],
        setup: (context) => {
          sawPodcast = context.has('podcast');
        },
      }),
    ]);

    expect(sawPodcast).toBe(true);
  });

  it('lets one bad subscriber fail without swallowing the others', async () => {
    const seen: string[] = [];
    const host = await load([
      definePlugin({
        id: 'noisy',
        version: '1.0.0',
        description: 'throws',
        capabilities: [Capability.Events],
        setup: (context) => {
          context.events.on(LoopEventType.Created, () => {
            throw new Error('boom');
          });
          context.events.on(LoopEventType.Created, async () => {
            seen.push('second');
            await Promise.resolve();
          });
        },
      }),
    ]);

    await expect(host.publish(created)).resolves.toBeUndefined();
    expect(seen).toEqual(['second']);
  });

  it('refuses two plugins that would answer on the same route', async () => {
    const mounts = (id: string): Plugin =>
      definePlugin({
        id,
        version: '1.0.0',
        description: 'mounts a route',
        capabilities: [Capability.Http],
        setup: (context) => {
          context.http.register({ basePath: 'api/podcast', controllers: [] });
        },
      });

    await expect(load([mounts('a'), mounts('b')])).rejects.toThrow(
      /\[plugin:b\] mounts 'api\/podcast', which 'a' owns/,
    );
  });

  it('wraps a failure in setup with the id of the plugin that caused it', async () => {
    const broken = definePlugin({
      id: 'broken',
      version: '1.0.0',
      description: 'misconfigured',
      capabilities: [],
      setup: () => {
        throw new Error('no api key');
      },
    });

    await expect(load([broken])).rejects.toThrow(/\[plugin:broken\] no api key/);
  });
});
