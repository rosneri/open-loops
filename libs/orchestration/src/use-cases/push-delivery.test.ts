import { describe, expect, it } from 'vitest';
import type { Clock, IdGenerator, Logger } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import {
  ConnectionMode,
  ConnectionStatus,
  Integration,
  asIntegrationId,
  type IntegrationRepository,
} from '@open-loops/integrations';
import type { Signal, SignalStore, SourceConnector } from '@open-loops/signals';
import { IngestSignalsUseCase } from './ingest-signals.use-case.js';
import { SyncSourcesUseCase } from './sync-sources.use-case.js';

const NOW = 1_800_000_000_000;

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
/** Only `now` is ever asked for here; the other two are the interface, not the fixture. */
const clock: Clock = {
  now: () => asInstant(NOW),
  startOfDay: (instant) => instant,
  dayKey: () => '2027-01-15' as ReturnType<Clock['dayKey']>,
};
const ids = (): IdGenerator => {
  let n = 0;
  return { next: () => `id-${String(++n)}` };
};

class FakeIntegrations implements IntegrationRepository {
  public readonly rows = new Map<string, Integration>();

  public add(input: { provider: string; status: ConnectionStatus }): Integration {
    const integration = Integration.declare({
      id: asIntegrationId(`existing-${input.provider}`),
      provider: input.provider,
      mode: ConnectionMode.Hosted,
    });
    if (input.status === ConnectionStatus.Active) {
      integration.beginConnect('ref');
      integration.activate({ scopes: [], at: asInstant(NOW - 1) });
    }
    this.rows.set(input.provider, integration);
    return integration;
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
  public save(integration: Integration): Promise<void> {
    this.rows.set(integration.provider, integration);
    return Promise.resolve();
  }
}

const signal = (overrides: Partial<Signal> = {}): Signal => ({
  provider: 'WISPR_FLOW',
  externalId: 'wispr:meeting:standup',
  kind: 'MEETING_NOTE',
  title: 'Eng standup',
  body: '## Action items\n- Neri to open the rate-limiting PR',
  author: { displayName: 'Wispr Flow Notetaker', isMe: false },
  participants: [],
  occurredAt: asInstant(NOW - 60_000),
  isDirectedAtMe: true,
  ...overrides,
});

const store = (): SignalStore =>
  ({
    append: (signals: readonly Signal[]) => Promise.resolve(signals.length),
  }) as unknown as SignalStore;

/**
 * Wispr Flow has no hosted API, so nothing pulls it and nothing ever completed a consent screen
 * for it. Delivering a recap is the only thing that can say it is alive.
 */
describe('a source that arrives by push', () => {
  const ingest = (integrations: IntegrationRepository): IngestSignalsUseCase =>
    new IngestSignalsUseCase({ signals: store(), integrations, ids: ids(), clock, logger });

  it('is connected by its first delivery, not by a button', async () => {
    const integrations = new FakeIntegrations();

    await ingest(integrations).execute({
      signals: [signal()],
      mode: ConnectionMode.LocalAgent,
    });

    const stored = (await integrations.findByProvider('WISPR_FLOW'))?.snapshot();
    expect(stored?.status).toBe(ConnectionStatus.Active);
    expect(stored?.lastSyncedAt).toBe(NOW);
    // The agent pushed it from somebody's machine, whatever this deployment calls itself.
    expect(stored?.mode).toBe(ConnectionMode.LocalAgent);
  });

  it('stamps one delivery per provider however many signals arrive', async () => {
    const integrations = new FakeIntegrations();

    await ingest(integrations).execute({
      signals: [
        signal(),
        signal({ externalId: 'wispr:meeting:retro' }),
        signal({ provider: 'RISEUP', externalId: 'riseup:1' }),
      ],
      mode: ConnectionMode.LocalAgent,
    });

    expect([...integrations.rows.keys()].sort()).toEqual(['RISEUP', 'WISPR_FLOW']);
  });

  /** A batch that was screened out entirely is a source that tried and failed, not a healthy one. */
  it('is not marked alive by a batch that was rejected', async () => {
    const integrations = new FakeIntegrations();

    await ingest(integrations).execute({
      signals: [signal({ title: '', body: '   ' })],
      mode: ConnectionMode.LocalAgent,
    });

    expect(integrations.rows.size).toBe(0);
  });

  it('clears the error a previous sweep left on it', async () => {
    const integrations = new FakeIntegrations();
    const existing = integrations.add({
      provider: 'WISPR_FLOW',
      status: ConnectionStatus.Disconnected,
    });
    existing.fail({ error: 'No connector is bound for WISPR_FLOW.' });

    await ingest(integrations).execute({ signals: [signal()], mode: ConnectionMode.LocalAgent });

    expect(existing.snapshot().lastError).toBeUndefined();
    expect(existing.snapshot().status).toBe(ConnectionStatus.Active);
  });
});

/**
 * The other half of the same bug: once a push source is active, the hourly sweep walks over it,
 * and there is no connector that can pull it. That used to throw, which failed the integration
 * and put "No connector is bound for WISPR_FLOW" on its card until the next delivery.
 */
describe('sweeping a deployment that has push sources', () => {
  const sync = (integrations: IntegrationRepository, connectors: readonly SourceConnector[]) =>
    new SyncSourcesUseCase({
      integrations,
      cursors: { get: () => Promise.resolve(undefined), set: () => Promise.resolve() },
      signals: store(),
      connectors,
      clock,
      logger,
    });

  const pulling = (provider: string): SourceConnector => ({
    supports: [provider],
    fetchSignals: () => Promise.resolve({ signals: [], cursor: asInstant(NOW) }),
  });

  it('reports a source nothing pulls as pushed rather than failed', async () => {
    const integrations = new FakeIntegrations();
    integrations.add({ provider: 'WISPR_FLOW', status: ConnectionStatus.Active });

    const result = await sync(integrations, [pulling('GITHUB')]).execute();

    expect(result.pushed).toEqual(['WISPR_FLOW']);
    expect(result.failures).toEqual([]);
    const stored = integrations.rows.get('WISPR_FLOW')?.snapshot();
    expect(stored?.status).toBe(ConnectionStatus.Active);
    expect(stored?.lastError).toBeUndefined();
  });

  /** And it must not claim a sync it did not do: the last delivery is the push's to stamp. */
  it('leaves the delivery time alone', async () => {
    const integrations = new FakeIntegrations();
    const pushSource = integrations.add({ provider: 'WISPR_FLOW', status: ConnectionStatus.Active });
    pushSource.receiveDelivery({ at: asInstant(NOW - 90_000), mode: ConnectionMode.LocalAgent });

    await sync(integrations, [pulling('GITHUB')]).execute();

    expect(pushSource.snapshot().lastSyncedAt).toBe(NOW - 90_000);
  });

  it('still sweeps the sources something can pull', async () => {
    const integrations = new FakeIntegrations();
    integrations.add({ provider: 'GITHUB', status: ConnectionStatus.Active });
    integrations.add({ provider: 'WISPR_FLOW', status: ConnectionStatus.Active });

    const result = await sync(integrations, [pulling('GITHUB')]).execute();

    expect(result.perProvider).toEqual({ GITHUB: 0 });
    expect(integrations.rows.get('GITHUB')?.snapshot().lastSyncedAt).toBe(NOW);
  });
});
