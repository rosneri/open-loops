import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@open-loops/kernel';
import type { OwnerScope } from '@open-loops/plugin-api';
import { PluginHost } from '@open-loops/plugin-host';
import template from './index.js';

const logger: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Only what the step declared — the host would throw on anything else, and so does this. */
const scope = (input: { enabled: boolean; open: number }): OwnerScope =>
  ({
    ownerId: 'neri',
    logger,
    settings: async () => await Promise.resolve({ enabled: input.enabled }),
    today: { execute: async () => await Promise.resolve({ counts: { OPEN: input.open } }) },
  }) as unknown as OwnerScope;

describe('the template plugin', () => {
  it('registers one tick step that runs after the day is planned', async () => {
    const host = await PluginHost.load({ plugins: [template], logger, env: {} });
    const [step] = host.tickSteps(() => scope({ enabled: true, open: 3 }));
    expect(step?.name).toBe('template');
    expect(step?.after).toEqual(['plan']);
    expect(await step?.run({} as never)).toEqual({ open: 3 });
  });

  it('stays quiet until switched on in Settings', async () => {
    const host = await PluginHost.load({ plugins: [template], logger, env: {} });
    const [step] = host.tickSteps(() => scope({ enabled: false, open: 3 }));
    expect(await step?.run({} as never)).toEqual({ skipped: 1 });
  });
});
