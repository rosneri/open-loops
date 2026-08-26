import type {
  BeginConnectionDto,
  IngestResultDto,
  IntegrationDto,
  TickReportDto,
  TodayDto,
} from '@open-loops/contracts';

const request = async <TResult>(path: string, init?: RequestInit): Promise<TResult> => {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${response.status}: ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as TResult;
};

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

/** The only place the client knows any URLs. Every screen goes through these functions. */
export const api = {
  today: () => request<TodayDto>('/api/today'),
  integrations: () => request<readonly IntegrationDto[]>('/api/integrations'),
  connectUrl: (provider: string) =>
    request<BeginConnectionDto>(
      `/api/integrations/${provider}/connect-url?returnTo=${encodeURIComponent(
        `${window.location.origin}/integrations`,
      )}`,
    ),
  disconnect: (provider: string) =>
    request<{ ok: true }>(`/api/integrations/${provider}`, { method: 'DELETE' }),
  command: (id: string, command: string, body: Record<string, unknown> = {}) =>
    request<{ ok: true }>(`/api/loops/${id}/${command}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  tick: () => request<TickReportDto>('/api/tick', { method: 'POST' }),
  rebalance: () =>
    request<{ day: string; blocks: number; deferred: number }>('/api/plan/rebalance', {
      method: 'POST',
    }),
  reorder: (order: readonly string[]) =>
    request<{ ok: true }>('/api/plan/reorder', {
      method: 'POST',
      body: JSON.stringify({ order }),
    }),
  tools: (query: string, toolkit?: string) =>
    request<{ tools: readonly DiscoveredTool[] }>(
      `/api/composio/tools?query=${encodeURIComponent(query)}${
        toolkit === undefined ? '' : `&toolkit=${toolkit}`
      }`,
    ),
  execute: (slug: string, args: Record<string, unknown> = {}) =>
    request<ToolExecution>('/api/composio/execute', {
      method: 'POST',
      body: JSON.stringify({ slug, args }),
    }),
  ingest: (signals: readonly unknown[]) =>
    request<IngestResultDto>('/api/agent/ingest', {
      method: 'POST',
      body: JSON.stringify({ signals }),
    }),
};
