import { Capability, definePlugin, type OwnerScope, type ProbeDefinition,
  type SourceDefinition,
} from '@open-loops/plugin-api';
import { ToolProbeRunner, includesAll, textOf } from '@open-loops/plugin-host';
import { probeText } from '@open-loops/loops';

/**
 * Trackers, and the two different questions people mean by "is it done". Closed is the universal
 * one. A named status is the one that matters in a team whose board has six columns and where
 * "In Review" is emphatically not finished.
 */
const provider = (draft: { provider?: string | undefined }): string => draft.provider ?? 'LINEAR';

const runnerFor =
  (question: ConstructorParameters<typeof ToolProbeRunner>[0]['question']) =>
  (scope: OwnerScope): ToolProbeRunner | undefined =>
    scope.tools === undefined
      ? undefined
      : new ToolProbeRunner({ tools: scope.tools, question, logger: scope.logger });

const issueClosed: ProbeDefinition = {
  kind: 'ISSUE_CLOSED',
  prompt: 'an issue or ticket has been closed. target is the issue key ("LIT-605").',
  provider,
  build: (draft) => (draft.target === undefined ? undefined : { issueRef: draft.target }),
  runner: runnerFor({
    intent: (probe) => `get the issue ${probeText(probe, 'issueRef') ?? ''} and its state`,
    // Every tracker spells the finished state differently and several spell it more than one way.
    satisfied: (payload) => /"(state|status)":\s*"(closed|done|completed)"/i.test(textOf(payload)),
  }),
};

const issueStatusIs: ProbeDefinition = {
  kind: 'ISSUE_STATUS_IS',
  prompt:
    'an issue has reached a particular state. target is the issue key, status is the state name.',
  provider,
  build: (draft) =>
    draft.target === undefined || draft.status === undefined
      ? undefined
      : { issueRef: draft.target, status: draft.status },
  runner: runnerFor({
    intent: (probe) => `get the issue ${probeText(probe, 'issueRef') ?? ''} and its status`,
    satisfied: (payload, probe) => includesAll(payload, [probeText(probe, 'status')]),
  }),
};

/**
 * The apps this plugin knows about: what upstream calls each one, and what to ask it for. These
 * were three tables in two other libraries; a source belongs with the code that understands it.
 */
const sources: readonly SourceDefinition[] = [
  { provider: 'LINEAR', label: 'Linear', toolkit: 'linear',
    intents: [
      'list Linear issues assigned to me that are not done',
    ] },
  { provider: 'JIRA', label: 'Jira', toolkit: 'jira',
    intents: [
      'search Jira for unresolved issues assigned to me',
    ] },
  { provider: 'ASANA', label: 'Asana', toolkit: 'asana' },
];

export default definePlugin({
  id: 'issue-tracker',
  version: '1.0.0',
  description: 'Issues and tickets.',
  capabilities: [Capability.RunProbes, Capability.Tools, Capability.WriteSignals],
  setup: (context) => {
    for (const source of sources) context.sources.register(source);
    for (const definition of [issueClosed, issueStatusIs]) context.probes.register(definition);
  },
});
