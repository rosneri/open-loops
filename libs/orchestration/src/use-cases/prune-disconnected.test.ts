import { describe, expect, it } from 'vitest';
import type { Clock, Logger } from '@open-loops/kernel';
import { asInstant, asMinutes } from '@open-loops/kernel';
import {
  ConnectionMode,
  ConnectionStatus,
  Integration,
  asIntegrationId,
  type IntegrationRepository,
} from '@open-loops/integrations';
import {
  LoopKind,
  ManualResolution,
  OpenLoop,
  asOpenLoopId,
  type OpenLoopId,
  type OpenLoopQuery,
  type OpenLoopRepository,
} from '@open-loops/loops';
import { PruneDisconnectedUseCase } from './prune-disconnected.use-case.js';

const NOW = 1_800_000_000_000;

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
const clock: Clock = {
  now: () => asInstant(NOW),
  startOfDay: (instant) => instant,
  dayKey: () => '2027-01-15' as ReturnType<Clock['dayKey']>,
};

const loop = (input: {
  id: string;
  provider: string;
  resolution?: ManualResolution;
}): OpenLoop =>
  OpenLoop.rehydrate({
    id: asOpenLoopId(input.id),
    kind: LoopKind.OutgoingCommitment,
    title: input.id,
    summary: '',
    source: {
      provider: input.provider,
      externalId: input.id,
      occurredAt: asInstant(NOW - 86_400_000),
    },
    criteria: [],
    evidence: [],
    estimate: asMinutes(15),
    priority: 50,
    confidence: 0.9,
    createdAt: asInstant(NOW - 86_400_000),
    updatedAt: asInstant(NOW - 86_400_000),
    ...(input.resolution === undefined
      ? {}
      : { manualResolution: { state: input.resolution, reason: 'because' } }),
  });

class FakeLoops implements OpenLoopRepository {
  public constructor(private rows: OpenLoop[]) {}

  public get ids(): readonly string[] {
    return this.rows.map((row) => String(row.id));
  }
  public findById(): Promise<OpenLoop | undefined> {
    return Promise.resolve(undefined);
  }
  public findBySourceKey(): Promise<OpenLoop | undefined> {
    return Promise.resolve(undefined);
  }
  public list(query: OpenLoopQuery): Promise<readonly OpenLoop[]> {
    const wanted = query.providers;
    return Promise.resolve(
      wanted === undefined
        ? this.rows
        : this.rows.filter((row) => wanted.includes(row.snapshot().source.provider)),
    );
  }
  public save(): Promise<void> {
    return Promise.resolve();
  }
  public saveMany(): Promise<void> {
    return Promise.resolve();
  }
  public delete(id: OpenLoopId): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
    return Promise.resolve();
  }
}

class FakeIntegrations implements IntegrationRepository {
  private readonly rows = new Map<string, Integration>();

  public add(provider: string, status: ConnectionStatus): void {
    const integration = Integration.declare({
      id: asIntegrationId(`i-${provider}`),
      provider,
      mode: ConnectionMode.Hosted,
    });
    if (status !== ConnectionStatus.Disconnected) {
      integration.beginConnect('ref');
      if (status === ConnectionStatus.Active) {
        integration.activate({ scopes: [], at: asInstant(NOW - 1) });
      } else {
        integration.fail({ error: 'a bad afternoon', expired: status === ConnectionStatus.Expired });
      }
    }
    this.rows.set(provider, integration);
  }

  public findById(): Promise<Integration | undefined> {
    return Promise.resolve(undefined);
  }
  public findByProvider(provider: string): Promise<Integration | undefined> {
    return Promise.resolve(this.rows.get(provider));
  }
  public listAll(): Promise<readonly Integration[]> {
    return Promise.resolve([...this.rows.values()]);
  }
  public listActive(): Promise<readonly Integration[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.isUsable()));
  }
  public save(): Promise<void> {
    return Promise.resolve();
  }
}

const sweep = (input: {
  integrations: FakeIntegrations;
  loops: FakeLoops;
}): PruneDisconnectedUseCase =>
  new PruneDisconnectedUseCase({
    integrations: input.integrations,
    loops: input.loops,
    clock,
    logger,
  });

describe('a sweep after an app was disconnected', () => {
  it('drops what is still live and keeps what already finished', async () => {
    const integrations = new FakeIntegrations();
    integrations.add('GITHUB', ConnectionStatus.Disconnected);
    const loops = new FakeLoops([
      loop({ id: 'open', provider: 'GITHUB' }),
      loop({ id: 'done', provider: 'GITHUB', resolution: ManualResolution.Done }),
      loop({ id: 'dropped', provider: 'GITHUB', resolution: ManualResolution.Dropped }),
    ]);

    const result = await sweep({ integrations, loops }).execute();

    expect(result.pruned).toBe(1);
    // The record of what was owed and settled survives disconnecting the app it came from.
    expect(loops.ids).toEqual(['done', 'dropped']);
  });

  it("leaves other apps' loops alone", async () => {
    const integrations = new FakeIntegrations();
    integrations.add('GITHUB', ConnectionStatus.Disconnected);
    integrations.add('SLACK', ConnectionStatus.Active);
    const loops = new FakeLoops([
      loop({ id: 'github-open', provider: 'GITHUB' }),
      loop({ id: 'slack-open', provider: 'SLACK' }),
    ]);

    await sweep({ integrations, loops }).execute();

    expect(loops.ids).toEqual(['slack-open']);
  });

  /**
   * A failed or expired connection is a token to refresh, not a decision. Deleting somebody's
   * open work over an API blip would be far worse than leaving it there.
   */
  it('does not touch a connection that merely broke', async () => {
    const integrations = new FakeIntegrations();
    integrations.add('GITHUB', ConnectionStatus.Failed);
    integrations.add('LINEAR', ConnectionStatus.Expired);
    const loops = new FakeLoops([
      loop({ id: 'github-open', provider: 'GITHUB' }),
      loop({ id: 'linear-open', provider: 'LINEAR' }),
    ]);

    const result = await sweep({ integrations, loops }).execute();

    expect(result.pruned).toBe(0);
    expect(loops.ids).toEqual(['github-open', 'linear-open']);
  });

  it('does nothing at all when everything is connected', async () => {
    const integrations = new FakeIntegrations();
    integrations.add('SLACK', ConnectionStatus.Active);
    const loops = new FakeLoops([loop({ id: 'slack-open', provider: 'SLACK' })]);

    const result = await sweep({ integrations, loops }).execute();

    expect(result).toEqual({ pruned: 0, providers: [] });
    expect(loops.ids).toEqual(['slack-open']);
  });
});
