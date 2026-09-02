import { Capability, definePlugin, type OwnerScope, type ProbeDefinition,
  type SourceDefinition,
} from '@open-loops/plugin-api';
import { ToolProbeRunner, textOf } from '@open-loops/plugin-host';
import { probeInstant, probeText } from '@open-loops/loops';

/**
 * A doc that was promised an update. Weaker evidence than the others by nature — "touched since
 * the promise" is the most any document store will tell you without reading the diff — so this
 * answers no rather than yes when it cannot see a timestamp.
 */
const documentUpdated: ProbeDefinition = {
  kind: 'DOCUMENT_UPDATED',
  prompt: 'a document has been edited since the promise. target is the document id or URL.',
  provider: (draft) => draft.provider ?? 'NOTION',
  build: (draft) =>
    draft.target === undefined ? undefined : { documentRef: draft.target, after: draft.now },
  runner: (scope: OwnerScope) =>
    scope.tools === undefined
      ? undefined
      : new ToolProbeRunner({
          tools: scope.tools,
          logger: scope.logger,
          question: {
            intent: (probe) =>
              `get the document ${probeText(probe, 'documentRef') ?? ''} and when it was last edited`,
            satisfied: (payload, probe) => {
              const after = probeInstant(probe, 'after');
              const edited = /"(last_edited_time|modifiedtime|updated_at)":"([^"]+)"/i.exec(
                textOf(payload),
              );
              if (after === undefined || edited?.[2] === undefined) return false;
              const at = Date.parse(edited[2]);
              return !Number.isNaN(at) && at >= after;
            },
          },
        }),
};

/**
 * The apps this plugin knows about: what upstream calls each one, and what to ask it for. These
 * were three tables in two other libraries; a source belongs with the code that understands it.
 */
const sources: readonly SourceDefinition[] = [
  { provider: 'NOTION', label: 'Notion', toolkit: 'notion',
    intents: [
      'search Notion for pages I recently edited',
    ] },
  { provider: 'GOOGLE_DRIVE', label: 'Google Drive', toolkit: 'googledrive',
    intents: [
      'list files recently modified in my Google Drive',
    ] },
];

export default definePlugin({
  id: 'documents',
  version: '1.0.0',
  description: 'Documents.',
  capabilities: [Capability.RunProbes, Capability.Tools, Capability.WriteSignals],
  setup: (context) => {
    for (const source of sources) context.sources.register(source);
    context.probes.register(documentUpdated);
  },
});
