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

  /**
   * Adopts every account the broker already holds. Authorisation lives with Composio, not with
   * this database, so a fresh deployment can pick up connections made on a laptop instead of
   * sending the user back through consent for each one.
   */
  public async adoptUpstream(): Promise<readonly SourceProvider[]> {
    const upstream = await this.deps.broker.listConnected();
    const adopted: SourceProvider[] = [];

    for (const connection of upstream) {
      const integration = await this.ensure(connection.provider);
      if (integration.snapshot().externalAccountRef === connection.externalAccountRef &&
          integration.isUsable()) {
        continue;
      }
      integration.beginConnect(connection.externalAccountRef);
      integration.activate({
        scopes: [],
        ...(connection.accountLabel === undefined
          ? {}
          : { accountLabel: connection.accountLabel }),
        at: this.deps.clock.now(),
      });
      await this.deps.integrations.save(integration);
      adopted.push(connection.provider);
    }

    if (adopted.length > 0) this.deps.logger.info('adopted upstream connections', { adopted });
    return adopted;
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
      handshake.redirectUrl === undefined
        ? await this.completeConnect({
            provider: input.provider,
            externalAccountRef: handshake.externalAccountRef,
          })
        : false;

    return {
      provider: input.provider,
      externalAccountRef: handshake.externalAccountRef,
      alreadyActive,
      ...(handshake.redirectUrl === undefined ? {} : { redirectUrl: handshake.redirectUrl }),
    };
  }

  /**
   * The provider tells us which account it just authorised. Trust that over whatever this
   * integration happens to be holding: starting a second connect flow overwrites the stored
   * reference, so relying on it silently completes the wrong attempt.
   */
  public async completeConnect(input: {
    provider: SourceProvider;
    externalAccountRef?: string;
  }): Promise<boolean> {
    const integration = await this.ensure(input.provider);
    const ref = input.externalAccountRef ?? integration.snapshot().externalAccountRef;
    if (ref === undefined) return false;
    integration.beginConnect(ref);

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
    this.deps.logger.info('integration connected', { provider: input.provider });
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
