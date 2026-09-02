/**
 * Explicit injection tokens for the singletons. Anything owned by a person is not here: those
 * are built per request by `WorkspaceFactory`, so there is no token that could accidentally be
 * injected without an owner.
 *
 * Nest can infer constructor types from decorator metadata, but interfaces vanish at
 * runtime — naming the ports here is what lets the modules depend on abstractions instead of on
 * concrete adapters.
 */
export const Tokens = {
  Config: 'OL_CONFIG',
  Clock: 'OL_CLOCK',
  Ids: 'OL_IDS',
  Logger: 'OL_LOGGER',
  Prisma: 'OL_PRISMA',

  UserRepository: 'OL_USER_REPOSITORY',
  SettingsRepository: 'OL_SETTINGS_REPOSITORY',
  ScheduleRepository: 'OL_SCHEDULE_REPOSITORY',
  /** The two repositories the Settings screen always reads together. */
  SettingsStores: 'OL_SETTINGS_STORES',
  /** The kinds of scheduled work the product owns rather than borrows from a plugin. */
  BuiltInSchedules: 'OL_BUILT_IN_SCHEDULES',

  /**
   * The Composio session cache, not a session: a session belongs to one account, and the only
   * way to reach one is to name that account. Undefined when no key is configured.
   */
  ComposioSessions: 'OL_COMPOSIO_SESSIONS',
  ConnectableProviders: 'OL_CONNECTABLE_PROVIDERS',
  ConnectionMode: 'OL_CONNECTION_MODE',
  PodcastGenerator: 'OL_PODCAST_GENERATOR',
  AudioStore: 'OL_AUDIO_STORE',
  /** Both halves of the podcast — a generator and somewhere to keep what it makes. */
  PodcastReadiness: 'OL_PODCAST_READINESS',

  /** What the installed plugins collectively decided this deployment is. */
  PluginHost: 'OL_PLUGIN_HOST',
  /** The probe kinds those plugins registered: the prompt, the parse and the runners. */
  ProbeCatalog: 'OL_PROBE_CATALOG',
  /** The apps they registered: labels, toolkit slugs and what to ask each one for. */
  SourceCatalog: 'OL_SOURCE_CATALOG',
  /** Every app this deployment knows about, in the order the Integrations screen shows them. */
  KnownProviders: 'OL_KNOWN_PROVIDERS',
  /** The kinds of scheduled work they registered, beside the two the product owns. */
  ScheduleCatalog: 'OL_SCHEDULE_CATALOG',

  StructuredGenerator: 'OL_STRUCTURED_GENERATOR',
  LoopExtractor: 'OL_LOOP_EXTRACTOR',
  LoopReconciler: 'OL_LOOP_RECONCILER',

} as const;
