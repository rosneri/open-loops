import { useState } from 'react';
import { api, type DiscoveredTool, type ToolExecution } from '../api.js';

const SUGGESTIONS = [
  'list my GitHub notifications and issues assigned to me',
  'search Slack messages that mention me',
  'list unread Gmail messages in my inbox',
  "list today's events from my primary Google Calendar",
  'list Linear issues assigned to me that are not done',
];

/**
 * Proof that a connection is real. Discovery goes through Composio's tool search rather than a
 * hard-coded slug, so what you see here is exactly what the hourly sync would call — and the
 * returned log id is the same one you can look up in the Composio dashboard.
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
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const guard = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hairline rounded-lg bg-ink-900/40 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Try a real call</h2>
          <p className="mt-1 max-w-xl text-sm text-chalk-500">
            Describe what you want in plain language. Composio resolves it to an actual tool on a
            connected account — no slug is ever hard-coded in this repository.
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
          disabled={busy || query.trim().length < 3}
          onClick={() =>
            void guard(async () => {
              setResult(undefined);
              setTools((await api.tools(query)).tools);
            })
          }
          className="rounded border border-chalk-600 px-4 py-2 text-xs text-chalk-100 transition hover:bg-ink-800 disabled:opacity-40"
        >
          {busy ? 'Working…' : 'Find tools'}
        </button>
      </div>

      {error !== undefined && (
        <p className="mt-4 font-mono text-[12px] break-all text-signal-unconfirmed">{error}</p>
      )}

      <ul className="mt-5 space-y-2">
        {tools.map((tool) => (
          <li key={tool.slug} className="hairline rounded bg-ink-950/40 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <code className="font-mono text-[12px] text-chalk-100">{tool.slug}</code>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void guard(async () => {
                    setResult(await api.execute(tool.slug));
                    onRefresh();
                  })
                }
                className="rounded border border-ink-700 px-2.5 py-1 text-[11px] text-chalk-300 transition hover:border-chalk-600 hover:text-chalk-100 disabled:opacity-40"
              >
                Run it
              </button>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] text-chalk-600">{tool.description}</p>
          </li>
        ))}
      </ul>

      {result !== undefined && (
        <div className="mt-5">
          <p className="font-mono text-[10px] tracking-[0.14em] text-chalk-600 uppercase">
            {result.ok ? 'result' : 'failed'} · log {result.logId}
          </p>
          <pre className="hairline mt-2 max-h-80 overflow-auto rounded bg-ink-950/70 p-4 font-mono text-[11px] text-chalk-300">
            {JSON.stringify(result.error ?? result.data, null, 2).slice(0, 6000)}
          </pre>
        </div>
      )}
    </section>
  );
}
