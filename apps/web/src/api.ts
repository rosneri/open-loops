import type {
  BeginConnectionDto,
  IngestResultDto,
  IntegrationDto,
  LoopDto,
  SettingsDto,
  TickReportDto,
  TodayDto,
  UpdateSettingsDto,
} from '@open-loops/contracts';
import type { PluginRequest } from '@open-loops/plugin-ui';

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

/** Thrown when the session is missing or expired, so the shell can swap in the sign-in form. */
export class UnauthorizedError extends Error {
  public constructor() {
    super('Not signed in.');
    this.name = 'UnauthorizedError';
  }
}

/**
 * A session can lapse in the middle of any screen, and every screen would otherwise have to
 * handle that itself. One event, raised here, lets the shell take over wherever the user was.
 */
export const UNAUTHORIZED_EVENT = 'open-loops:unauthorized';

/**
 * A request that never settles is worse than one that fails: the screen sits on "Signing in…"
 * or a skeleton with nothing to click and nothing to read. A tick saturating the API's event
 * loop, a laptop waking on a dead network, a proxy holding the socket open — all of them look
 * identical from here, and all of them should end in a sentence the user can act on.
 *
 * A tick can legitimately run for minutes, so it gets a longer leash than the rest.
 */
const DEFAULT_TIMEOUT_MS = 30_000;
const SLOW_PATHS = ['/api/tick', '/api/plan/rebalance', '/api/composio/execute'];
const SLOW_TIMEOUT_MS = 300_000;

const timeoutFor = (path: string, slow: boolean): number =>
  slow || SLOW_PATHS.some((prefix) => path.startsWith(prefix))
    ? SLOW_TIMEOUT_MS
    : DEFAULT_TIMEOUT_MS;

const request = async <TResult>(
  path: string,
  init: RequestInit = {},
  options: { readonly slow?: boolean } = {},
): Promise<TResult> => {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');

  const limit = timeoutFor(path, options.slow === true);
  let response: Response;
  try {
    // `same-origin` is the default, but the session lives in a cookie now — saying so keeps the
    // next person from "simplifying" this into a credential-less fetch.
    response = await fetch(path, {
      ...init,
      headers,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(limit),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new Error(
        `${init.method ?? 'GET'} ${path} gave up after ${String(Math.round(limit / 1000))}s. ` +
          'The API did not answer — check that it is running and reachable.',
      );
    }
    throw cause instanceof Error ? cause : new Error(String(cause));
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new UnauthorizedError();
  }
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

/**
 * The same fetch, handed to plugin panels. They get the session, the 401 hand-off and the
 * timeout for free, and the core never learns which paths they call.
 */
export const pluginRequest: PluginRequest = async (path, init, options) =>
  await request(path, init, options);

const returnTo = (): string =>
  encodeURIComponent(`${window.location.origin}/integrations`);

export interface SessionUser {
  readonly id: string;
  readonly username: string;
}

/** The only place the client knows any URLs. Every screen goes through these functions. */
export const api = {
  me: async (): Promise<SessionUser> => await request<SessionUser>('/api/auth/me'),

  login: async (username: string, password: string): Promise<SessionUser> =>
    await post<SessionUser>('/api/auth/login', { username, password }),

  /** Whether this deployment offers a signup form, or is a login and nothing else. */
  registrationEnabled: async (): Promise<boolean> =>
    (await request<{ enabled: boolean }>('/api/auth/registration')).enabled,

  /** Succeeds signed in, exactly as `login` does — the cookie comes back on the same response. */
  register: async (input: {
    username: string;
    password: string;
    inviteCode: string;
  }): Promise<SessionUser> => await post<SessionUser>('/api/auth/register', input),

  logout: async (): Promise<{ ok: true }> => await post<{ ok: true }>('/api/auth/logout'),

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

  settings: async (): Promise<SettingsDto> => await request<SettingsDto>('/api/settings'),

  saveSettings: async (patch: UpdateSettingsDto): Promise<SettingsDto> =>
    await request<SettingsDto>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
};
