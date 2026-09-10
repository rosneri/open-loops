import { describe, expect, it } from 'vitest';
import { asInstant, type Logger } from '@open-loops/kernel';
import type { SourceDefinition } from '@open-loops/plugin-api';
import { SourceCatalog } from '@open-loops/plugin-host';
import { ComposioSourceConnector } from './composio-source-connector.js';
import type { ComposioToolExplorer, ToolExecution } from './composio-tool-explorer.js';

const silent: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const wispr: SourceDefinition = {
  provider: 'WISPR_FLOW',
  label: 'Wispr Flow',
  toolkit: 'CUSTOM_WISPR_FLOW',
  intents: ['list my recent recorded meetings on Wispr Flow'],
  hydrate: {
    intent: 'get the notes and action items of a meeting on Wispr Flow',
    idKeys: ['meeting_id'],
    argument: 'meeting_id',
    limit: 2,
  },
};

const ok = (data: Record<string, unknown>): ToolExecution => ({
  slug: 'CUSTOM_WISPR_FLOW_GET_MEETING',
  ok: true,
  logId: 'log_1',
  data,
});

/**
 * A search that returns rows without bodies, and a detail tool that has them. Records every
 * detail call so the test can assert what was asked for rather than only what came back.
 */
const explorerFor = (input: {
  list: Record<string, unknown>;
  detail?: (id: string) => ToolExecution;
  detailFound?: boolean;
}) => {
  const asked: string[] = [];
  const explorer = {
    searchAndExecute: () => Promise.resolve(ok(input.list)),
    search: () =>
      Promise.resolve(
        input.detailFound === false
          ? []
          : [
              {
                slug: 'CUSTOM_WISPR_FLOW_GET_MEETING',
                toolkit: 'CUSTOM_WISPR_FLOW',
                description: '',
                connected: true,
              },
            ],
      ),
    execute: ({ args }: { slug: string; args?: Record<string, unknown> }) => {
      const raw = args?.['meeting_id'];
      const id = typeof raw === 'string' ? raw : '';
      asked.push(id);
      return Promise.resolve(input.detail?.(id) ?? ok({ summary: `summary for ${id}` }));
    },
  } as unknown as ComposioToolExplorer;
  return { explorer, asked };
};

const connectorFor = (explorer: ComposioToolExplorer, definition: SourceDefinition = wispr) =>
  new ComposioSourceConnector({
    explorer,
    sources: new SourceCatalog([definition]),
    logger: silent,
    meHandles: () => Promise.resolve(['neri']),
    focus: () => Promise.resolve(undefined),
  });

const fetch = (connector: ComposioSourceConnector) =>
  connector.fetchSignals({ provider: 'WISPR_FLOW', since: asInstant(1_700_000_000_000), limit: 50 });

describe('hydrating a listed row', () => {
  it('expands each row with the detail call, so the action items arrive', async () => {
    const { explorer, asked } = explorerFor({
      list: { meetings: [{ meeting_id: 'm1', title: 'Standup' }] },
      detail: (id) => ok({ summary: `### Next steps\n- Neri to ship ${id}` }),
    });

    const { signals } = await fetch(connectorFor(explorer));

    expect(asked).toEqual(['m1']);
    expect(signals[0]?.body).toContain('Neri to ship m1');
  });

  it('keeps the row when the detail call fails, rather than losing the meeting', async () => {
    const { explorer } = explorerFor({
      list: { meetings: [{ meeting_id: 'm1', title: 'Standup' }] },
      detail: () => ({ slug: 'x', ok: false, logId: 'log_2', error: 'rate limited', data: {} }),
    });

    const { signals } = await fetch(connectorFor(explorer));

    expect(signals).toHaveLength(1);
    expect(signals[0]?.title).toBe('Standup');
    expect(signals[0]?.body).toBe('');
  });

  it('stops at the declared limit but still emits what it did not expand', async () => {
    const { explorer, asked } = explorerFor({
      list: {
        meetings: [{ meeting_id: 'm1' }, { meeting_id: 'm2' }, { meeting_id: 'm3' }],
      },
    });

    const { signals } = await fetch(connectorFor(explorer));

    expect(asked).toEqual(['m1', 'm2']);
    expect(signals).toHaveLength(3);
    expect(signals[2]?.externalId).toBe('wispr:meeting:m3');
  });

  /** A scratchpad row has no `meeting_id`, so the meeting detail tool is never called on it. */
  it('skips a row that carries none of the declared id keys', async () => {
    const { explorer, asked } = explorerFor({
      list: { notes: [{ id: 'n1', title: 'Hiring loop', content_excerpt: 'Owe Dana a scorecard.' }] },
    });

    const { signals } = await fetch(connectorFor(explorer));

    expect(asked).toEqual([]);
    expect(signals[0]?.kind).toBe('DOCUMENT');
    expect(signals[0]?.body).toBe('Owe Dana a scorecard.');
  });

  it('leaves a source that declares no hydrate on its single call', async () => {
    const { explorer, asked } = explorerFor({
      list: { meetings: [{ meeting_id: 'm1', title: 'Standup' }] },
    });
    const { hydrate: _none, ...plain } = wispr;

    const { signals } = await fetch(connectorFor(explorer, plain));

    expect(asked).toEqual([]);
    expect(signals).toHaveLength(1);
  });

  it('falls back to the unexpanded rows when no tool matches the hydrate intent', async () => {
    const { explorer, asked } = explorerFor({
      list: { meetings: [{ meeting_id: 'm1', title: 'Standup' }] },
      detailFound: false,
    });

    const { signals } = await fetch(connectorFor(explorer));

    expect(asked).toEqual([]);
    expect(signals[0]?.title).toBe('Standup');
  });
});
