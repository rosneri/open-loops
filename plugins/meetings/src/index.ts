import { Capability, definePlugin, type SourceDefinition } from '@open-loops/plugin-api';

/**
 * Wispr Flow, brokered rather than pushed. Its Notetaker used to arrive only at
 * `/api/agent/ingest`, on the belief that there was no hosted API to connect to. There is: a
 * public MCP server at `api.wisprflow.ai/connect/mcp` behind OAuth with dynamic client
 * registration, which Composio brokers as a project-owned custom toolkit.
 *
 * The toolkit slug is `CUSTOM_WISPR_FLOW` because Composio prefixes every custom MCP toolkit it
 * did not write itself. It is registered per project, so a fresh deployment has to register it
 * before this source can connect — unlike `gmail` or `github`, which Composio already owns.
 *
 * The push route in `plugins/local-sources` is deliberately left standing for RiseUp and as the
 * fallback for anyone whose recaps never reach the hosted server.
 */
const sources: readonly SourceDefinition[] = [
  {
    provider: 'WISPR_FLOW',
    label: 'Wispr Flow',
    toolkit: 'CUSTOM_WISPR_FLOW',
    intents: [
      'list my recent recorded meetings on Wispr Flow',
      'list my recent notes on the Wispr Flow scratchpad',
    ],
    /**
     * Wispr's search returns a title, an attendee preview and times — and nothing anybody owes
     * anybody. The action items live in the meeting's Flow Summary, which only `get_meeting`
     * returns, so listing alone would produce recaps the extractor is right to ignore.
     *
     * Only `meeting_id` is looked for, never a bare `id`: the same plan runs over the scratchpad
     * intent above, and a note carries an `id` that means nothing to `get_meeting`. Naming the
     * meeting-only key is what makes notes skip the second call instead of failing it.
     */
    hydrate: {
      // Phrasing checked against Composio's tool search: this ranks `get_meeting` first, while
      // "get one recorded meeting" resolves to `get_upcoming_meeting`, which takes a calendar id
      // and refuses past events — the wrong tool, called successfully, returning nothing.
      intent: 'get the notes and action items of a meeting on Wispr Flow',
      idKeys: ['meeting_id'],
      argument: 'meeting_id',
      limit: 10,
    },
  },
];

export default definePlugin({
  id: 'meetings',
  version: '1.0.0',
  description: 'Meeting recaps.',
  capabilities: [Capability.WriteSignals],
  setup: (context) => {
    for (const source of sources) context.sources.register(source);
  },
});
