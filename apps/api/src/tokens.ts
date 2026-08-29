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

  SourceConnectors: 'OL_SOURCE_CONNECTORS',
  ConnectionBroker: 'OL_CONNECTION_BROKER',
  ConnectableProviders: 'OL_CONNECTABLE_PROVIDERS',
  ConnectionMode: 'OL_CONNECTION_MODE',
  ToolExplorer: 'OL_TOOL_EXPLORER',
  PodcastGenerator: 'OL_PODCAST_GENERATOR',
  AudioStore: 'OL_AUDIO_STORE',

  StructuredGenerator: 'OL_STRUCTURED_GENERATOR',
  LoopExtractor: 'OL_LOOP_EXTRACTOR',
  LoopReconciler: 'OL_LOOP_RECONCILER',

} as const;
