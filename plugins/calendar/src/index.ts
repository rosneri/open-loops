import { Capability, definePlugin, type OwnerScope, type ProbeDefinition,
  type SourceDefinition,
} from '@open-loops/plugin-api';
import { ToolProbeRunner, asArray, includesAll } from '@open-loops/plugin-host';
import { probeText } from '@open-loops/loops';

/**
 * "I'll get something in the diary." The only probe here that needs nothing from the model but
 * the sentence it already wrote — if it did not say what to look for, the description is a
 * better search term than nothing.
 */
const calendarEventExists: ProbeDefinition = {
  kind: 'CALENDAR_EVENT_EXISTS',
  prompt: 'a calendar event has been created. contains is a fragment of its title.',
  provider: (draft) => draft.provider ?? 'GOOGLE_CALENDAR',
  build: (draft) => ({
    titleContains: draft.contains ?? draft.describedAs,
    after: draft.now,
  }),
  runner: (scope: OwnerScope) =>
    scope.tools === undefined
      ? undefined
      : new ToolProbeRunner({
          tools: scope.tools,
          logger: scope.logger,
          question: {
            intent: (probe) =>
              `list my upcoming calendar events matching ${probeText(probe, 'titleContains') ?? ''}`,
            satisfied: (payload, probe) =>
              asArray(payload).some((item) =>
                includesAll(item, [probeText(probe, 'titleContains')]),
              ),
          },
        }),
};

/**
 * The apps this plugin knows about: what upstream calls each one, and what to ask it for. These
 * were three tables in two other libraries; a source belongs with the code that understands it.
 */
const sources: readonly SourceDefinition[] = [
  { provider: 'GOOGLE_CALENDAR', label: 'Google Calendar', toolkit: 'googlecalendar',
    intents: [
      "list today's events from my primary Google Calendar",
    ] },
];

export default definePlugin({
  id: 'calendar',
  version: '1.0.0',
  description: 'Calendar entries.',
  capabilities: [Capability.RunProbes, Capability.Tools, Capability.WriteSignals],
  setup: (context) => {
    for (const source of sources) context.sources.register(source);
    context.probes.register(calendarEventExists);
  },
});
