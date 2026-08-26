import type { Clock, IdGenerator, Logger, SourceProvider } from '@open-loops/kernel';
import { ALL_SOURCE_PROVIDERS } from '@open-loops/kernel';
import type {
  ConnectionBroker,
  ConnectionMode,
  Integration,
  IntegrationRepository,
} from '@open-loops/integrations';
import { ConnectionStatus, Integration as Aggregate, asIntegrationId } from '@open-loops/integrations';
import type { BeginConnectionDto, IntegrationDto } from '@open-loops/contracts';

export interface ManageIntegrationsDeps {
  readonly integrations: IntegrationRepository;
  readonly broker: ConnectionBroker;
  readonly mode: ConnectionMode;
  readonly connectableProviders: readonly SourceProvider[];
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Everything the integrations screen needs. Providers the user has never touched are returned
 * as disconnected placeholders rather than being absent, so the grid is always complete and the
 * UI needs no notion of "a provider that might exist".
 */
export class ManageIntegrationsUseCase {
  public constructor(private readonly deps: ManageIntegrationsDeps) {}

  public async list(): Promise<readonly IntegrationDto[]> {
    const stored = await this.deps.integrations.listAll();
    const byProvider = new Map(stored.map((item) => [item.provider, item]));
    return ALL_SOURCE_PROVIDERS.map((provider) => {
      const props = byProvider.get(provider)?.snapshot();
      return {
        provider,
        status: props?.status ?? ConnectionStatus.Disconnected,
        mode: props?.mode ?? this.deps.mode,
        connectable: this.deps.connectableProviders.includes(provider),
        ...(props?.accountLabel === undefined ? {} : { accountLabel: props.accountLabel }),
        ...(props?.lastSyncedAt === undefined ? {} : { lastSyncedAt: props.lastSyncedAt }),
        ...(props?.lastError === undefined ? {} : { lastError: props.lastError }),
      };
    });
  }

  public async beginConnect(input: {
    provider: SourceProvider;
    callbackUrl: string;
  }): Promise<BeginConnectionDto> {
    const integration = await this.ensure(input.provider);
    const handshake = await this.deps.broker.beginConnection(input);
    integration.beginConnect(handshake.externalAccountRef);
    await this.deps.integrations.save(integration);

    // Local mode has nothing to authorise, so the connection is live the moment it is declared.
    const alreadyActive =
      handshake.redirectUrl === undefined ? await this.completeConnect(input.provider) : false;

    return {
      provider: input.provider,
      externalAccountRef: handshake.externalAccountRef,
      alreadyActive,
      ...(handshake.redirectUrl === undefined ? {} : { redirectUrl: handshake.redirectUrl }),
    };
  }

  public async completeConnect(provider: SourceProvider): Promise<boolean> {
    const integration = await this.ensure(provider);
    const ref = integration.snapshot().externalAccountRef;
    if (ref === undefined) return false;

    const state = await this.deps.broker.completeConnection(ref);
    if (!state.active) {
      integration.fail({ error: 'Authorisation did not complete.' });
      await this.deps.integrations.save(integration);
      return false;
    }
    integration.activate({
      scopes: state.scopes,
      ...(state.accountLabel === undefined ? {} : { accountLabel: state.accountLabel }),
      at: this.deps.clock.now(),
    });
    await this.deps.integrations.save(integration);
    this.deps.logger.info('integration connected', { provider });
    return true;
  }

  public async disconnect(provider: SourceProvider): Promise<void> {
    const integration = await this.deps.integrations.findByProvider(provider);
    if (integration === undefined) return;
    const ref = integration.snapshot().externalAccountRef;
    if (ref !== undefined) await this.deps.broker.disconnect(ref);
    integration.disconnect();
    await this.deps.integrations.save(integration);
  }

  private async ensure(provider: SourceProvider): Promise<Integration> {
    const existing = await this.deps.integrations.findByProvider(provider);
    if (existing !== undefined) return existing;
    const created = Aggregate.declare({
      id: asIntegrationId(this.deps.ids.next()),
      provider,
      mode: this.deps.mode,
    });
    await this.deps.integrations.save(created);
    return created;
  }
}
