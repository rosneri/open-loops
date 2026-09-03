import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@open-loops/kernel';
import { MANUAL_CONFIRMATION } from '@open-loops/loops';
import { Capability, definePlugin } from '@open-loops/plugin-api';
import type { OwnerScope } from '@open-loops/plugin-api';
import { PluginHost, ProbeCatalog, ScheduleCatalog, SourceCatalog } from '@open-loops/plugin-host';
import { enabledPlugins } from './enabled.js';
import { generatorFor } from '../infrastructure/reasoning.js';

const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const host = async (setting?: string): Promise<PluginHost> =>
  await PluginHost.load({ plugins: enabledPlugins(setting), logger, env: {} });

const catalog = async (setting?: string): Promise<ProbeCatalog> =>
  ProbeCatalog.from(await host(setting));

const sources = async (setting?: string): Promise<SourceCatalog> =>
  SourceCatalog.from(await host(setting));

/**
 * These eleven kinds used to be a literal list in four different files. The point of the test is
 * that the plugins this build ships still add up to exactly the app that existed before them —
 * a refactor that quietly dropped `DOCUMENT_UPDATED` would leave every loop that needed it open
 * forever, and nothing else would have complained.
 */
const EXPECTED = [
  'PULL_REQUEST_EXISTS',
  'PULL_REQUEST_MERGED',
  'REVIEW_SUBMITTED',
  'ISSUE_CLOSED',
  'ISSUE_STATUS_IS',
  'REPLIED_IN_THREAD',
  'MESSAGE_SENT_TO',
  'EMAIL_SENT',
  'CALENDAR_EVENT_EXISTS',
  'DOCUMENT_UPDATED',
  MANUAL_CONFIRMATION,
];

describe('the plugins this build ships', () => {
  it('registers every probe kind the app had before it had plugins', async () => {
    // Order is a display concern for sources, not for kinds — the model is given a set.
    expect([...(await catalog()).kinds()].sort()).toEqual([...EXPECTED].sort());
  });

  it('registers every app the app knew about, in the order the screen lists them', async () => {
    expect((await sources()).providers()).toEqual([
      'SLACK',
      'DISCORD',
      'MICROSOFT_TEAMS',
      'WHATSAPP',
      'GMAIL',
      'OUTLOOK',
      'GOOGLE_CALENDAR',
      'NOTION',
      'GOOGLE_DRIVE',
      'GITHUB',
      'GITLAB',
      'LINEAR',
      'JIRA',
      'ASANA',
      'SENTRY',
      'WISPR_FLOW',
      'RISEUP',
      'MANUAL',
    ]);
  });

  it('offers a Connect button only where there is an account to authorise', async () => {
    const connectable = (await sources()).connectable();
    expect(connectable).toContain('SLACK');
    // Wispr Flow has no hosted API to broker; it arrives by push or not at all.
    expect(connectable).not.toContain('WISPR_FLOW');
    expect(connectable).not.toContain('MANUAL');
  });

  it('keeps the toolkit slugs upstream actually uses', async () => {
    const catalogue = await sources();
    expect(catalogue.toolkitFor('GOOGLE_CALENDAR')).toBe('googlecalendar');
    expect(catalogue.providerForToolkit('microsoft_teams')).toBe('MICROSOFT_TEAMS');
    expect(catalogue.intentsFor('GITHUB')).toHaveLength(2);
    // Both are brokered by Composio under these exact slugs; a typo here is a Connect button
    // that opens a consent screen for nothing.
    expect(catalogue.toolkitFor('SENTRY')).toBe('sentry');
    expect(catalogue.toolkitFor('NOTION')).toBe('notion');
  });

  it('gives Sentry something to ask for, so a connected account is actually swept', async () => {
    const catalogue = await sources();
    expect(catalogue.connectable()).toContain('SENTRY');
    expect(catalogue.intentsFor('SENTRY')).not.toHaveLength(0);
  });

  it('refuses to boot if two plugins claim the same app', async () => {
    const claim = (id: string) =>
      definePlugin({
        id,
        version: '1.0.0',
        description: 'claims Slack',
        capabilities: [Capability.WriteSignals],
        setup: (context) => {
          context.sources.register({ provider: 'SLACK', label: 'Slack', toolkit: 'slack' });
        },
      });

    const both = await PluginHost.load({ plugins: [claim('a'), claim('b')], logger, env: {} });
    expect(() => SourceCatalog.from(both)).toThrow(/registered by both 'a' and 'b'/);
  });

  it('teaches the model only about kinds something can answer', async () => {
    const guide = (await catalog('code-review')).guide();
    expect(guide).toContain('PULL_REQUEST_EXISTS');
    expect(guide).toContain(MANUAL_CONFIRMATION);
    expect(guide).not.toContain('EMAIL_SENT');
  });

  it('still leaves MANUAL_CONFIRMATION when every plugin is switched off', async () => {
    const bare = await PluginHost.load({ plugins: [], logger, env: {} });
    expect(ProbeCatalog.from(bare).kinds()).toEqual([MANUAL_CONFIRMATION]);
  });

  it('narrows a draft into the parameters its kind needs', async () => {
    const probe = (await catalog()).toProbe({
      kind: 'PULL_REQUEST_EXISTS',
      describedAs: "a PR titled ~'rate limiting' exists in acme/api",
      target: 'acme/api',
      contains: 'rate limit',
      now: 1_000,
    });

    expect(probe).toEqual({
      kind: 'PULL_REQUEST_EXISTS',
      describedAs: "a PR titled ~'rate limiting' exists in acme/api",
      provider: 'GITHUB',
      params: { repository: 'acme/api', createdAfter: 1_000, titleContains: 'rate limit' },
    });
  });

  it('downgrades an under-specified probe rather than leaving one nothing can satisfy', async () => {
    // No target: there is no repository to look in, so this could never come back satisfied.
    const probe = (await catalog()).toProbe({
      kind: 'PULL_REQUEST_EXISTS',
      describedAs: 'a PR exists somewhere',
      now: 1_000,
    });

    expect(probe.kind).toBe(MANUAL_CONFIRMATION);
  });

  it('downgrades a kind no installed plugin claims', async () => {
    const probe = (await catalog('mail')).toProbe({
      kind: 'PULL_REQUEST_EXISTS',
      describedAs: 'a PR exists',
      target: 'acme/api',
      now: 1_000,
    });

    expect(probe.kind).toBe(MANUAL_CONFIRMATION);
  });

  /** The flagship feature is a plugin now; the core owns the sweep and nothing else on a clock. */
  it('puts the podcast on the clock through the same registry as anything else', async () => {
    const kinds = ScheduleCatalog.from(await host()).kinds(() => ({}) as OwnerScope);
    expect(kinds.map((kind) => kind.kind)).toEqual(['podcast']);
    expect((await host()).settings().map((entry) => entry.pluginId)).toEqual(['podcast']);
  });

  it('ships no podcast when the podcast plugin is switched off', async () => {
    const bare = await host('chat');
    expect(ScheduleCatalog.from(bare).kinds(() => ({}) as OwnerScope)).toEqual([]);
    expect(bare.http()).toEqual([]);
  });

  it('thinks with Claude Code alone when nothing else has a key', async () => {
    const generator = generatorFor({
      host: await host(),
      preferred: 'claude-code',
      model: undefined,
      logger,
    });
    expect(generator.label).not.toContain('→');
  });

  it('puts a keyed provider behind Claude Code as soon as its key exists', async () => {
    const keyed = await PluginHost.load({
      plugins: enabledPlugins(undefined),
      logger,
      env: { ANTHROPIC_API_KEY: 'sk-test' },
    });
    const generator = generatorFor({ host: keyed, preferred: 'claude-code', model: 'opus', logger });
    // The explicit model goes to the preferred provider only; the fallback keeps its own default.
    expect(generator.label).toContain('→ anthropic/claude-sonnet-5');
  });

  it('names the providers that exist when AI_PROVIDER asks for one that does not', async () => {
    const loaded = await host();
    expect(() =>
      generatorFor({ host: loaded, preferred: 'telepathy', model: undefined, logger }),
    ).toThrow(/claude-code, anthropic, openai/);
  });

  it('refuses a plugin id that does not exist instead of silently shipping less', () => {
    expect(() => enabledPlugins('code-review,telepathy')).toThrow(/telepathy/);
  });
});
