import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@open-loops/kernel';
import type { OwnerScope } from '@open-loops/plugin-api';
import { PluginHost, ScheduleCatalog } from '@open-loops/plugin-host';
import podcast from './index.js';

const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const load = async (env: Record<string, string | undefined>): Promise<PluginHost> =>
  await PluginHost.load({ plugins: [podcast], logger, env });

const scope = (): OwnerScope => ({}) as OwnerScope;

const kindFor = async (env: Record<string, string | undefined>) => {
  const [kind] = ScheduleCatalog.from(await load(env)).kinds(scope);
  if (kind === undefined) throw new Error('nothing registered');
  return kind;
};

describe('the podcast plugin', () => {
  it('registers one kind of scheduled work, switched off until asked for', async () => {
    const kind = await kindFor({});
    expect(kind.kind).toBe('podcast');
    expect(kind.enabledByDefault).toBe(false);
    expect(kind.defaultCron).toBe('0 7 * * *');
  });

  it('seeds its schedule from its own variable, not the app config', async () => {
    expect((await kindFor({ PODCAST_CRON: '30 6 * * 1-5' })).defaultCron).toBe('30 6 * * 1-5');
  });

  /** The studio needs no key and a long-lived machine has a disk: nothing to configure. */
  it('is available on a developer machine with nothing set', async () => {
    expect((await kindFor({})).available()).toBe(true);
  });

  /** A function's disk does not outlive the request, so without a blob store there is no store. */
  it('is unavailable on a serverless function until a blob store is attached', async () => {
    expect((await kindFor({ VERCEL: '1' })).available()).toBe(false);
    expect((await kindFor({ VERCEL: '1', BLOB_READ_WRITE_TOKEN: 'tok' })).available()).toBe(true);
  });

  it('needs a key when ElevenLabs is the voice', async () => {
    expect((await kindFor({ PODCAST_PROVIDER: 'elevenlabs' })).available()).toBe(false);
    expect(
      (await kindFor({ PODCAST_PROVIDER: 'elevenlabs', ELEVENLABS_API_KEY: 'k' })).available(),
    ).toBe(true);
  });

  it('mounts its routes under its own prefix, with its options beside them', async () => {
    const [mounted] = (await load({})).http();
    expect(mounted?.definition.basePath).toBe('api/podcast');
    expect(mounted?.definition.providers).toHaveLength(1);
  });

  it('registers a settings fragment whose schema fills in the defaults', async () => {
    const [fragment] = (await load({})).settings();
    expect(fragment?.pluginId).toBe('podcast');
    expect(fragment?.definition.schema.parse({})).toEqual({ length: 'default' });
    expect(() => fragment?.definition.schema.parse({ length: 'epic' })).toThrow();
  });
});
