import { DomainError, type Instant, type SourceProvider } from '@open-loops/kernel';
import type { ConnectionMode, ConnectionStatus } from './connection-mode.js';
import { ConnectionStatus as Status } from './connection-mode.js';
import type { IntegrationId } from './ids.js';

export interface IntegrationProps {
  readonly id: IntegrationId;
  readonly provider: SourceProvider;
  readonly mode: ConnectionMode;
  readonly status: ConnectionStatus;
  readonly accountLabel?: string;
  /** Opaque handle owned by the adapter: a Composio connected-account id, or a local marker. */
  readonly externalAccountRef?: string;
  readonly scopes: readonly string[];
  readonly lastSyncedAt?: Instant;
  readonly lastError?: string;
  readonly connectedAt?: Instant;
}

export class Integration {
  private props: IntegrationProps;

  private constructor(props: IntegrationProps) {
    this.props = props;
  }

  public static rehydrate(props: IntegrationProps): Integration {
    return new Integration(props);
  }

  public static declare(input: {
    id: IntegrationId;
    provider: SourceProvider;
    mode: ConnectionMode;
  }): Integration {
    return new Integration({
      id: input.id,
      provider: input.provider,
      mode: input.mode,
      status: Status.Disconnected,
      scopes: [],
    });
  }

  public get id(): IntegrationId {
    return this.props.id;
  }

  public get provider(): SourceProvider {
    return this.props.provider;
  }

  public snapshot(): IntegrationProps {
    return this.props;
  }

  public isUsable(): boolean {
    return this.props.status === Status.Active;
  }

  public beginConnect(externalAccountRef: string): void {
    this.props = { ...this.props, status: Status.Pending, externalAccountRef };
  }

  /**
   * Authorised, but not usable yet: the source declared a question that has to be answered
   * before a sync would fetch the right thing. Kept distinct from Pending — nothing is in
   * flight, nobody is on a consent screen, and the only thing standing between here and Active
   * is a choice on a screen this app owns.
   */
  public awaitSetup(input: { at: Instant }): void {
    const { lastError: _cleared, ...rest } = this.props;
    this.props = {
      ...rest,
      status: Status.AwaitingSetup,
      connectedAt: this.props.connectedAt ?? input.at,
    };
  }

  public activate(input: { scopes: readonly string[]; accountLabel?: string; at: Instant }): void {
    this.props = {
      ...this.props,
      status: Status.Active,
      scopes: input.scopes,
      ...(input.accountLabel === undefined ? {} : { accountLabel: input.accountLabel }),
      connectedAt: this.props.connectedAt ?? input.at,
    };
  }

  /**
   * A source with no hosted API to broker — RiseUp's cashflow — proves it is alive by
   * delivering something. There is no consent screen to complete and no
   * token to hold, so the push itself is the connection: it activates the integration, stamps
   * the delivery and clears whatever error was standing.
   *
   * The mode is the local agent's regardless of what the deployment runs as. A hosted Open Loops
   * still receives these from somebody's machine, and calling that HOSTED would be claiming a
   * broker holds a token for it.
   */
  public receiveDelivery(input: { at: Instant; mode: ConnectionMode }): void {
    const { lastError: _cleared, ...rest } = this.props;
    this.props = {
      ...rest,
      mode: input.mode,
      status: Status.Active,
      lastSyncedAt: input.at,
      connectedAt: this.props.connectedAt ?? input.at,
    };
  }

  public recordSync(at: Instant): void {
    if (!this.isUsable()) {
      throw new DomainError('INTEGRATION_NOT_ACTIVE', `${this.props.provider} is not connected.`);
    }
    const { lastError: _cleared, ...rest } = this.props;
    this.props = { ...rest, lastSyncedAt: at };
  }

  public fail(input: { error: string; expired?: boolean }): void {
    this.props = {
      ...this.props,
      status: input.expired === true ? Status.Expired : Status.Failed,
      lastError: input.error,
    };
  }

  public disconnect(): void {
    this.props = { ...this.props, status: Status.Disconnected, scopes: [] };
  }
}
