import type { DiscoveredTool } from '../api.js';

interface ToolListProps {
  readonly tools: readonly DiscoveredTool[];
  readonly busy: boolean;
  readonly onRun: (slug: string) => void;
}

export function ToolList({ tools, busy, onRun }: ToolListProps): React.ReactElement {
  return (
    <ul className="mt-5 space-y-2">
      {tools.map((tool) => (
        <li key={tool.slug} className="hairline rounded bg-ink-950/40 p-4">
          <div className="flex items-baseline justify-between gap-4">
            <code className="font-mono text-[12px] text-chalk-100">{tool.slug}</code>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onRun(tool.slug);
              }}
              className="rounded border border-ink-700 px-2.5 py-1 text-[11px] text-chalk-300 transition hover:border-chalk-600 hover:text-chalk-100 disabled:opacity-40"
            >
              Run it
            </button>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] text-chalk-600">{tool.description}</p>
        </li>
      ))}
    </ul>
  );
}
