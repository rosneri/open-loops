/**
 * Explicit injection tokens for every port. Nest can infer constructor types from decorator
 * metadata, but interfaces vanish at runtime — naming the ports here is what lets the modules
 * depend on abstractions instead of on concrete adapters.
 */
export const Tokens = {
  Config: 'OL_CONFIG',
  Clock: 'OL_CLOCK',
  Ids: 'OL_IDS',
  Logger: 'OL_LOGGER',
  Prisma: 'OL_PRISMA',

  LoopRepository: 'OL_LOOP_REPOSITORY',
  PlanRepository: 'OL_PLAN_REPOSITORY',
  IntegrationRepository: 'OL_INTEGRATION_REPOSITORY',
  SignalStore: 'OL_SIGNAL_STORE',
  SyncCursorStore: 'OL_SYNC_CURSOR_STORE',
  EventPublisher: 'OL_EVENT_PUBLISHER',
  BusyTimeProvider: 'OL_BUSY_TIME_PROVIDER',
  ProbeTaskStore: 'OL_PROBE_TASK_STORE',

  SourceConnectors: 'OL_SOURCE_CONNECTORS',
  ConnectionBroker: 'OL_CONNECTION_BROKER',
  ProbeRunners: 'OL_PROBE_RUNNERS',
  ConnectableProviders: 'OL_CONNECTABLE_PROVIDERS',
  ConnectionMode: 'OL_CONNECTION_MODE',
  ToolExplorer: 'OL_TOOL_EXPLORER',

  LoopExtractor: 'OL_LOOP_EXTRACTOR',
  LoopReconciler: 'OL_LOOP_RECONCILER',

  SyncSources: 'OL_UC_SYNC_SOURCES',
  ExtractLoops: 'OL_UC_EXTRACT_LOOPS',
  ReconcileLoops: 'OL_UC_RECONCILE_LOOPS',
  RebalanceDay: 'OL_UC_REBALANCE_DAY',
  RunTick: 'OL_UC_RUN_TICK',
  IngestSignals: 'OL_UC_INGEST_SIGNALS',
  ManageIntegrations: 'OL_UC_MANAGE_INTEGRATIONS',
  LoopCommands: 'OL_UC_LOOP_COMMANDS',
  TodayView: 'OL_Q_TODAY_VIEW',
} as const;
