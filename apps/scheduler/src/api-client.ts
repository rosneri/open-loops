import type { Logger } from '@open-loops/kernel';
import type { SchedulerConfig } from './config.js';

export interface ScheduledJob {
  readonly kind: string;
  readonly cron: string;
  readonly enabled: boolean;
}

export interface Schedule {
  readonly username: string;
  readonly timeZone: string;
  readonly schedules: readonly ScheduledJob[];
}

/**
 * Everything this process knows about the deployment goes through here. Each call names the
 * account in a header rather than trusting the API to guess, which is what lets one clock drive
 * many people from one machine.
 */
export class ApiClient {
  public constructor(
    private readonly config: SchedulerConfig,
    private readonly logger: Logger,
  ) {}

  public async schedules(): Promise<readonly Schedule[]> {
    return await this.send<readonly Schedule[]>({
      method: 'GET',
      path: '/api/schedules',
      timeoutMs: 30_000,
    });
  }

  /**
   * Runs one kind of work for one account. This process used to have a method per kind and a
   * path per kind baked into it, which meant a new kind of scheduled work needed the clock
   * redeployed. It names the kind now and the deployment decides what that means.
   */
  public async run(input: { username: string; kind: string }): Promise<void> {
    await this.send({
      method: 'POST',
      path: `/api/schedules/${input.kind}/run`,
      username: input.username,
      // A sweep can legitimately take minutes and a podcast longer; the wider of the two is the
      // safe deadline now that this process cannot tell which is which.
      timeoutMs: Math.max(this.config.SWEEP_TIMEOUT_MS, this.config.PODCAST_TIMEOUT_MS),
    });
  }

  private async send<TResult>(request: {
    method: string;
    path: string;
    username?: string;
    body?: unknown;
    timeoutMs: number;
  }): Promise<TResult> {
    const url = `${this.config.OPEN_LOOPS_API_URL.replace(/\/$/, '')}${request.path}`;
    const response = await fetch(url, {
      method: request.method,
      headers: {
        authorization: `Bearer ${this.config.OPEN_LOOPS_AGENT_TOKEN}`,
        'content-type': 'application/json',
        ...(request.username === undefined ? {} : { 'x-open-loops-user': request.username }),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      // Without a deadline a hung request would silently hold the "already running" flag for
      // this account forever, and that account would never sweep again.
      signal: AbortSignal.timeout(request.timeoutMs),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `${request.method} ${request.path} → ${String(response.status)}: ${detail.slice(0, 300)}`,
      );
    }

    const text = await response.text();
    this.logger.debug('api call finished', { path: request.path, bytes: text.length });
    return (text.length === 0 ? undefined : JSON.parse(text)) as TResult;
  }
}
