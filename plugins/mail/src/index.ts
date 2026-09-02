import { Capability, definePlugin, type OwnerScope, type ProbeDefinition,
  type SourceDefinition,
} from '@open-loops/plugin-api';
import { ToolProbeRunner, asArray } from '@open-loops/plugin-host';
import { probeText } from '@open-loops/loops';

/**
 * "I'll send it over" is one of the most common promises there is, and one of the few with an
 * unambiguous record of whether it happened.
 */
const emailSent: ProbeDefinition = {
  kind: 'EMAIL_SENT',
  prompt:
    'an email was sent. target is the recipient address, contains is a subject-line fragment.',
  provider: (draft) => draft.provider ?? 'GMAIL',
  build: (draft) =>
    draft.target === undefined
      ? undefined
      : {
          toEmail: draft.target,
          after: draft.now,
          ...(draft.contains === undefined ? {} : { subjectContains: draft.contains }),
        },
  runner: (scope: OwnerScope) =>
    scope.tools === undefined
      ? undefined
      : new ToolProbeRunner({
          tools: scope.tools,
          logger: scope.logger,
          question: {
            intent: (probe) =>
              `search my sent mail for messages to ${probeText(probe, 'toEmail') ?? ''}`,
            satisfied: (payload) => asArray(payload).length > 0,
          },
        }),
};

/**
 * The apps this plugin knows about: what upstream calls each one, and what to ask it for. These
 * were three tables in two other libraries; a source belongs with the code that understands it.
 */
const sources: readonly SourceDefinition[] = [
  { provider: 'GMAIL', label: 'Gmail', toolkit: 'gmail',
    intents: [
      'list unread Gmail messages in my inbox',
    ] },
  { provider: 'OUTLOOK', label: 'Outlook', toolkit: 'outlook' },
];

export default definePlugin({
  id: 'mail',
  version: '1.0.0',
  description: 'Sent mail.',
  capabilities: [Capability.RunProbes, Capability.Tools, Capability.WriteSignals],
  setup: (context) => {
    for (const source of sources) context.sources.register(source);
    context.probes.register(emailSent);
  },
});
