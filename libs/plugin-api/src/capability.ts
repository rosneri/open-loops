/**
 * What a plugin is allowed to reach. A manifest lists these; the host builds a context that
 * carries only the ports the list asked for, so an ungranted capability is not something a
 * plugin is asked politely to avoid — it is an object it was never handed.
 *
 * This is the same enforcement `WorkspaceFactory` uses for tenancy: make the illegal question
 * unrepresentable rather than checking for it at every call site.
 */
export const Capability = {
  /** Read this owner's loops. Reading is the common case; writing status is never granted. */
  ReadLoops: 'read:loops',
  /** Read the assembled day — the plan, what is overdue, what is done but unconfirmed. */
  ReadToday: 'read:today',
  /** Push signals into the feed. Extraction still decides whether any become loops. */
  WriteSignals: 'write:signals',
  /** Contribute a `ProbeRunner`, and therefore evidence. Verdicts only, never a status. */
  RunProbes: 'run:probes',
  /** Ask a connected app a question. The answer is data; deciding what it means is not this. */
  Tools: 'tools',
  /** Read and write rows in this plugin's own namespace of the record store. */
  Storage: 'storage',
  /** Mount HTTP routes under this plugin's prefix. */
  Http: 'http',
  /** Add a step to the heartbeat. Steps report counters; they cannot fail the tick. */
  Tick: 'tick',
  /** Register work that runs on a cron the user can edit. */
  Schedule: 'schedule',
  /** Contribute a fragment of the Settings screen and the row behind it. */
  Settings: 'settings',
  /** Subscribe to loop events. Subscribers observe; they cannot veto or mutate. */
  Events: 'events',
  /** Contribute to the client: a nav tab, a settings panel, a row decorator. */
  Ui: 'ui',
  /** Ask the configured model for structured output. */
  Reasoning: 'reasoning',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export const ALL_CAPABILITIES: readonly Capability[] = Object.values(Capability);

export const isCapability = (value: string): value is Capability =>
  (ALL_CAPABILITIES as readonly string[]).includes(value);
