import type { ToolExecution } from '../api.js';

const MAX_PREVIEW = 6000;

/**
 * The log id is the point of this panel: it is the same identifier Composio shows in its
 * dashboard, which is what turns "it seemed to work" into something checkable.
 */
export function ToolResult({ result }: { readonly result: ToolExecution }): React.ReactElement {
  return (
    <div className="mt-5">
      <p className="font-mono text-[10px] tracking-[0.14em] text-chalk-600 uppercase">
        {result.ok ? 'result' : 'failed'} · log {result.logId}
      </p>
      <pre className="hairline mt-2 max-h-80 overflow-auto rounded bg-ink-950/70 p-4 font-mono text-[11px] text-chalk-300">
        {JSON.stringify(result.error ?? result.data, null, 2).slice(0, MAX_PREVIEW)}
      </pre>
    </div>
  );
}
