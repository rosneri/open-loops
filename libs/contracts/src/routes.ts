/** Route strings live beside the DTOs so a client can never drift from the server by a typo. */
export const ApiRoutes = {
  today: '/api/today',
  loops: '/api/loops',
  loopCommand: (id: string, command: string) => `/api/loops/${id}/${command}`,
  planReorder: '/api/plan/reorder',
  integrations: '/api/integrations',
  integrationConnect: (provider: string) => `/api/integrations/${provider}/connect`,
  integrationCallback: (provider: string) => `/api/integrations/${provider}/callback`,
  integrationDisconnect: (provider: string) => `/api/integrations/${provider}`,
  tick: '/api/tick',
  rebalance: '/api/plan/rebalance',
  ingest: '/api/agent/ingest',
  agentProbes: '/api/agent/probes',
  agentEvidence: '/api/agent/evidence',
  composioTools: '/api/composio/tools',
  composioExecute: '/api/composio/execute',
  health: '/api/health',
} as const;
