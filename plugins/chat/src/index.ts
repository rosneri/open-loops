import { Capability, definePlugin, type OwnerScope, type ProbeDefinition,
  type SourceDefinition,
} from '@open-loops/plugin-api';
import { ToolProbeRunner, asArray } from '@open-loops/plugin-host';
import { probeText } from '@open-loops/loops';

/**
 * The acknowledgement half of the product, mostly. Shipping the work and telling the person who
 * was waiting are different events that fail independently, and this is what checks the second.
 */
const provider = (draft: { provider?: string | undefined }): string => draft.provider ?? 'SLACK';

const runnerFor =
  (question: ConstructorParameters<typeof ToolProbeRunner>[0]['question']) =>
  (scope: OwnerScope): ToolProbeRunner | undefined =>
    scope.tools === undefined
      ? undefined
      : new ToolProbeRunner({ tools: scope.tools, question, logger: scope.logger });

const repliedInThread: ProbeDefinition = {
  kind: 'REPLIED_IN_THREAD',
  prompt: 'a reply was posted in a thread. target is the thread id from the signal.',
  provider,
  build: (draft) =>
    draft.target === undefined ? undefined : { threadRef: draft.target, after: draft.now },
  runner: runnerFor({
    intent: (probe) => `read the message thread ${probeText(probe, 'threadRef') ?? ''}`,
    // One message is the thread itself. Two is somebody having answered it.
    satisfied: (payload) => asArray(payload).length > 1,
  }),
};

const messageSentTo: ProbeDefinition = {
  kind: 'MESSAGE_SENT_TO',
  prompt:
    'a message was sent to somebody. target is the person or channel, contains is text it should include.',
  provider,
  build: (draft) =>
    draft.target === undefined
      ? undefined
      : {
          recipientRef: draft.target,
          after: draft.now,
          ...(draft.contains === undefined ? {} : { bodyContains: draft.contains }),
        },
  runner: runnerFor({
    intent: (probe) => `search for messages I sent to ${probeText(probe, 'recipientRef') ?? ''}`,
    satisfied: (payload) => asArray(payload).length > 0,
  }),
};

/**
 * The apps this plugin knows about: what upstream calls each one, and what to ask it for. These
 * were three tables in two other libraries; a source belongs with the code that understands it.
 */
const sources: readonly SourceDefinition[] = [
  { provider: 'SLACK', label: 'Slack', toolkit: 'slack',
    intents: [
      'search Slack messages that mention me or are addressed to me',
    ] },
  { provider: 'DISCORD', label: 'Discord', toolkit: 'discord' },
  { provider: 'MICROSOFT_TEAMS', label: 'Microsoft Teams', toolkit: 'microsoft_teams' },
  { provider: 'WHATSAPP', label: 'WhatsApp', toolkit: 'whatsapp',
    intents: [
      'list my recent WhatsApp messages and unread chats',
    ] },
];

export default definePlugin({
  id: 'chat',
  version: '1.0.0',
  description: 'Threads and direct messages.',
  capabilities: [Capability.RunProbes, Capability.Tools, Capability.WriteSignals],
  setup: (context) => {
    for (const source of sources) context.sources.register(source);
    for (const definition of [repliedInThread, messageSentTo]) context.probes.register(definition);
  },
});
