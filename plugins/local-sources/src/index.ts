import { Capability, definePlugin, type SourceDefinition } from '@open-loops/plugin-api';

/**
 * The sources with no hosted API to broker. Wispr Flow's meeting recaps and RiseUp's cashflow
 * both exist only behind an MCP server the user runs themselves, so the local agent reads them
 * and pushes them to `/api/agent/ingest` like everything else in local mode.
 *
 * No toolkit, deliberately: that is what makes the Integrations screen show them as real sources
 * without offering a Connect button that could not possibly work.
 */
const sources: readonly SourceDefinition[] = [
  { provider: 'WISPR_FLOW', label: 'Wispr Flow' },
  { provider: 'RISEUP', label: 'RiseUp' },
  /** Anything typed in by hand, and the fallback owner of a signal from nowhere in particular. */
  { provider: 'MANUAL', label: 'Manual' },
];

export default definePlugin({
  id: 'local-sources',
  version: '1.0.0',
  description: 'Sources that arrive by push.',
  capabilities: [Capability.WriteSignals],
  setup: (context) => {
    for (const source of sources) context.sources.register(source);
  },
});
