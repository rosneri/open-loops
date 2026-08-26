import { useState } from 'react';
import { api, type DiscoveredTool, type ToolExecution } from '../api.js';
import { useAsyncAction } from '../hooks/use-async-action.js';
import { ErrorPanel } from './error-panel.js';
import { ToolList } from './tool-list.js';
import { ToolResult } from './tool-result.js';

const SUGGESTIONS = [
  'list my GitHub notifications and issues assigned to me',
  'search Slack messages that mention me',
  'list unread Gmail messages in my inbox',
  "list today's events from my primary Google Calendar",
  'list Linear issues assigned to me that are not done',
];

/**
 * Proof that a connection is real. Discovery goes through Composio's tool search rather than a
 * hard-coded slug, so what you see here is exactly what the hourly sync would call.
 */
export function ToolBench({
  toolkits,
  onRefresh,
}: {
  readonly toolkits: readonly string[];
  readonly onRefresh: () => void;
}): React.ReactElement {
  const [query, setQuery] = useState(SUGGESTIONS[0] ?? '');
  const [tools, setTools] = useState<readonly DiscoveredTool[]>([]);
  const [result, setResult] = useState<ToolExecution | undefined>();
  const action = useAsyncAction();

  const find = (): void => {
    void action.run(async () => {
      setResult(undefined);
      setTools((await api.tools(query)).tools);
    });
  };

  const run = (slug: string): void => {
    void action.run(async () => {
      setResult(await api.execute(slug));
      onRefresh();
    });
  };

  return (
    <section className="hairline rounded-lg bg-ink-900/40 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Try a real call</h2>
          <p className="mt-1 max-w-xl text-sm text-chalk-500">
            Describe what you want in plain language. Composio resolves it to an actual tool on a
            connected account — no slug is hard-coded anywhere in this repository.
          </p>
        </div>
        <span className="font-mono text-[10px] tracking-[0.14em] text-chalk-600 uppercase">
          {toolkits.length === 0 ? 'nothing connected yet' : `${toolkits.length} connected`}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              setQuery(suggestion);
            }}
            className="rounded-full border border-ink-700 px-3 py-1 text-[11px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100"
          >
            {suggestion.split(' ').slice(0, 4).join(' ')}…
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="hairline flex-1 rounded bg-ink-950/60 px-3 py-2 text-sm text-chalk-100 outline-none focus:border-chalk-600"
          placeholder="what do you want to fetch?"
        />
        <button
          type="button"
          disabled={action.busy || query.trim().length < 3}
          onClick={find}
          className="rounded border border-chalk-600 px-4 py-2 text-xs text-chalk-100 transition hover:bg-ink-800 disabled:opacity-40"
        >
          {action.busy ? 'Working…' : 'Find tools'}
        </button>
      </div>

      {action.error !== undefined && (
        <div className="mt-4">
          <ErrorPanel message={action.error} />
        </div>
      )}

      <ToolList tools={tools} busy={action.busy} onRun={run} />
      {result !== undefined && <ToolResult result={result} />}
    </section>
  );
}
