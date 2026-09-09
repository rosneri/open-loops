import type { Clock, IdGenerator, Logger, SourceProvider } from '@open-loops/kernel';
import type {
  ConnectionBroker,
  Integration,
  IntegrationProps,
  IntegrationRepository,
} from '@open-loops/integrations';
import {
  ConnectionMode,
  ConnectionStatus,
  Integration as Aggregate,
  asIntegrationId,
} from '@open-loops/integrations';
import type { BeginConnectionDto, IntegrationDto } from '@open-loops/contracts';

export interface ManageIntegrationsDeps {
  readonly integrations: IntegrationRepository;
  readonly broker: ConnectionBroker;
  readonly mode: ConnectionMode;
  /**
   * Every app this deployment knows about, in the order the Integrations screen shows them. It
   * used to be a constant in the kernel; it is now whatever the installed source plugins add up
   * to, so an app nothing can reach is not offered.
   */
  readonly knownProviders: readonly SourceProvider[];
  readonly connectableProviders: readonly SourceProvider[];
  /**
   * The ones that arrive by push instead of by OAuth — the sources that named no toolkit. It is
   * a property of the source rather than of the deployment, which is why it is not simply
   * "everything that is not connectable": locally every provider is connectable, and Wispr Flow
   * still has no hosted API to connect to.
   */
  readonly pushProviders: readonly SourceProvider[];
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** `exactOptionalPropertyTypes` again: an absent field and an explicit `undefined` differ. */
const whatIsKnown = (
  props: IntegrationProps | undefined,
): Pick<IntegrationDto, 'accountLabel' | 'lastSyncedAt' | 'lastError'> => ({
  ...(props?.accountLabel === undefined ? {} : { accountLabel: props.accountLabel }),
  ...(props?.lastSyncedAt === undefined ? {} : { lastSyncedAt: props.lastSyncedAt }),
  ...(props?.lastError === undefined ? {} : { lastError: props.lastError }),
});

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
    return this.deps.knownProviders.map((provider) =>
      this.describe(provider, byProvider.get(provider)?.snapshot()),
    );
  }

  /** One card. A provider nobody has touched is a disconnected placeholder, not an absence. */
  private describe(provider: SourceProvider, props: IntegrationProps | undefined): IntegrationDto {
    const pushed = this.deps.pushProviders.includes(provider);
    return {
      provider,
      status: props?.status ?? ConnectionStatus.Disconnected,
      // An untouched source is described by how it would arrive, not by how this deployment
      // reaches the ones it brokers: nothing will ever deliver Wispr Flow but somebody's agent.
      mode: props?.mode ?? (pushed ? ConnectionMode.LocalAgent : this.deps.mode),
      delivery: pushed ? 'PUSH' : 'OAUTH',
      // A push source is never connectable, in any mode: there is no consent to give, and a
      // button that declared it connected would be a button that lies the moment it is wrong.
      connectable: !pushed && this.deps.connectableProviders.includes(provider),
      ...whatIsKnown(props),
    };
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
