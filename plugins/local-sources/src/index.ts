import { Capability, definePlugin, type SourceDefinition } from '@open-loops/plugin-api';

/**
 * The sources with no hosted API to broker. RiseUp's cashflow exists only behind an MCP server
 * the user runs themselves under their own Personal Access Token, so the local agent reads it
 * and pushes it to `/api/agent/ingest` like everything else in local mode.
 *
 * No toolkit, deliberately: that is what makes the Integrations screen show it as a real source
 * without offering a Connect button that could not possibly work.
 *
 * Wispr Flow used to be here on the same reasoning and no longer is — it turned out to publish a
 * hosted MCP server, so it is brokered in `plugins/meetings`. The push route still accepts it:
 * `/api/agent/ingest` takes any provider, and a recap delivered that way still activates the
 * card. This list is what has *only* that route.
 */
const sources: readonly SourceDefinition[] = [
  { provider: 'RISEUP', label: 'RiseUp' },
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
