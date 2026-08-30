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

  StructuredGenerator: 'OL_STRUCTURED_GENERATOR',
  LoopExtractor: 'OL_LOOP_EXTRACTOR',
  LoopReconciler: 'OL_LOOP_RECONCILER',

} as const;
