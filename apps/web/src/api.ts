import type {
  BeginConnectionDto,
  IngestResultDto,
  IntegrationDto,
  LoopDto,
  TickReportDto,
  TodayDto,
} from '@open-loops/contracts';

export interface DiscoveredTool {
  readonly slug: string;
  readonly toolkit: string;
  readonly description: string;
  readonly connected: boolean;
}

export interface ToolExecution {
  readonly slug: string;
  readonly ok: boolean;
  readonly logId: string;
  readonly error?: string;
  readonly data: Record<string, unknown>;
}

export interface RebalanceResult {
  readonly day: string;
  readonly blocks: number;
  readonly deferred: number;
}

const request = async <TResult>(path: string, init: RequestInit = {}): Promise<TResult> => {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `${init.method ?? 'GET'} ${path} → ${response.status}: ${detail.slice(0, 300)}`,
    );
  }
  return (await response.json()) as TResult;
};

const post = async <TResult>(path: string, body?: unknown): Promise<TResult> =>
  await request<TResult>(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const returnTo = (): string =>
  encodeURIComponent(`${window.location.origin}/integrations`);

/** The only place the client knows any URLs. Every screen goes through these functions. */
export const api = {
  today: async (): Promise<TodayDto> => await request<TodayDto>('/api/today'),

  loops: async (): Promise<readonly LoopDto[]> => await request<readonly LoopDto[]>('/api/loops'),

  integrations: async (): Promise<readonly IntegrationDto[]> =>
    await request<readonly IntegrationDto[]>('/api/integrations'),

  connectUrl: async (provider: string): Promise<BeginConnectionDto> =>
    await request<BeginConnectionDto>(
      `/api/integrations/${provider}/connect-url?returnTo=${returnTo()}`,
    ),

  disconnect: async (provider: string): Promise<{ ok: true }> =>
    await request<{ ok: true }>(`/api/integrations/${provider}`, { method: 'DELETE' }),

  command: async (id: string, command: string): Promise<{ ok: true }> =>
    await post<{ ok: true }>(`/api/loops/${id}/${command}`, {}),

  tick: async (): Promise<TickReportDto> => await post<TickReportDto>('/api/tick'),

  rebalance: async (): Promise<RebalanceResult> =>
    await post<RebalanceResult>('/api/plan/rebalance'),

  reorder: async (order: readonly string[]): Promise<{ ok: true }> =>
    await post<{ ok: true }>('/api/plan/reorder', { order }),

  tools: async (query: string, toolkit?: string): Promise<{ tools: readonly DiscoveredTool[] }> =>
    await request<{ tools: readonly DiscoveredTool[] }>(
      `/api/composio/tools?query=${encodeURIComponent(query)}${
        toolkit === undefined ? '' : `&toolkit=${toolkit}`
      }`,
    ),

  execute: async (slug: string, args: Record<string, unknown> = {}): Promise<ToolExecution> =>
    await post<ToolExecution>('/api/composio/execute', { slug, args }),

  ingest: async (signals: readonly unknown[]): Promise<IngestResultDto> =>
    await post<IngestResultDto>('/api/agent/ingest', { signals }),
};
