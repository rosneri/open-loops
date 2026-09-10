import { describe, expect, it } from 'vitest';
import type { Clock, IdGenerator, Logger } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import { ConnectionMode, ConnectionStatus } from '@open-loops/integrations';
import type {
  ConnectionBroker,
  Integration,
  IntegrationRepository,
} from '@open-loops/integrations';
import { ManageIntegrationsUseCase } from './manage-integrations.use-case.js';

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
const ids: IdGenerator = { next: () => 'id-1' };

class FakeIntegrations implements IntegrationRepository {
  public readonly rows = new Map<string, Integration>();

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

/** Composio's answer, which is always "yes, authorised" here — the gate is what is under test. */
const broker: ConnectionBroker = {
  beginConnection: () => Promise.resolve({ externalAccountRef: 'ref' }),
  completeConnection: () => Promise.resolve({ active: true, scopes: [] }),
  disconnect: () => Promise.resolve(),
  listConnected: () => Promise.resolve([]),
};

const useCaseWith = (complete: () => boolean) => {
  const integrations = new FakeIntegrations();
  const manage = new ManageIntegrationsUseCase({
    integrations,
    broker,
    mode: ConnectionMode.Hosted,
    knownProviders: ['GITHUB'],
    connectableProviders: ['GITHUB'],
    pushProviders: [],
    setup: {
      complete: () => Promise.resolve(complete()),
      labelFor: () => 'Choose which GitHub organisations count',
    },
    ids,
    clock,
    logger,
  });
  return { manage, integrations };
};

const statusOf = (integrations: FakeIntegrations): ConnectionStatus | undefined =>
  integrations.rows.get('GITHUB')?.snapshot().status;

describe('a source that asks a question before it will connect', () => {
  it('holds the connection at awaiting-setup while the question is unanswered', async () => {
    const { manage, integrations } = useCaseWith(() => false);

    const active = await manage.completeConnect({
      provider: 'GITHUB',
      externalAccountRef: 'ref',
    });

    expect(active).toBe(false);
    expect(statusOf(integrations)).toBe(ConnectionStatus.AwaitingSetup);
    // The whole point: nothing syncs a connection nobody has scoped yet.
    expect(integrations.rows.get('GITHUB')?.isUsable()).toBe(false);
  });

  it('activates straight away when there was nothing to ask', async () => {
    const { manage, integrations } = useCaseWith(() => true);

    const active = await manage.completeConnect({
      provider: 'GITHUB',
      externalAccountRef: 'ref',
    });

    expect(active).toBe(true);
    expect(statusOf(integrations)).toBe(ConnectionStatus.Active);
  });

  /**
   * The answer is saved on a settings screen that knows nothing about integrations, so listing
   * is what notices. Without this the card would sit at "needs a choice" after the choice.
   */
  it('finishes the connection once the answer exists', async () => {
    let answered = false;
    const { manage, integrations } = useCaseWith(() => answered);

    await manage.completeConnect({ provider: 'GITHUB', externalAccountRef: 'ref' });
    expect(statusOf(integrations)).toBe(ConnectionStatus.AwaitingSetup);

    answered = true;
    const cards = await manage.list();

    expect(statusOf(integrations)).toBe(ConnectionStatus.Active);
    expect(cards[0]?.status).toBe('ACTIVE');
  });

  it('tells the card what is still missing, and only while it is missing', async () => {
    const { manage } = useCaseWith(() => false);
    await manage.completeConnect({ provider: 'GITHUB', externalAccountRef: 'ref' });

    const [card] = await manage.list();

    expect(card?.status).toBe('AWAITING_SETUP');
    expect(card?.setupLabel).toBe('Choose which GitHub organisations count');
  });
});
