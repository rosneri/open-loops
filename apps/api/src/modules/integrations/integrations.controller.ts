import { Controller, Delete, Get, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { BeginConnectionDto, IntegrationDto } from '@open-loops/contracts';
import type { SourceProvider } from '@open-loops/kernel';
import type { SourceCatalog } from '@open-loops/plugin-host';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { siteUrl, type AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { WorkspaceFactory } from '../../infrastructure/workspace.factory.js';
import { HandshakeTokens } from './handshake-tokens.js';
import { Owner, Public } from '@open-loops/plugin-nest';
import { resolveReturnUrl } from './return-url.js';

interface CallbackQuery {
  readonly returnTo?: string;
  /** Names the account that started this handshake; signed, so it cannot be edited in transit. */
  readonly state?: string;
  /** Composio's own field name; it arrives snake_cased on the redirect. */
  readonly connected_account_id?: string;
}

@Controller('api/integrations')
export class IntegrationsController {
  public constructor(
    private readonly workspaces: WorkspaceFactory,
    private readonly handshakes: HandshakeTokens,
    @Inject(Tokens.Config) private readonly config: AppConfig,
    @Inject(Tokens.SourceCatalog) private readonly sources: SourceCatalog,
  ) {}

  @Get()
  public async list(@Owner() ownerId: string): Promise<readonly IntegrationDto[]> {
    return await this.workspaces.for(ownerId).integrations.list();
  }

  /**
   * One click to connect. Hosted mode returns a Composio consent URL — Composio owns the OAuth
   * application, which is why no redirect URI is ever registered in Slack, GitHub or Google.
   * Local mode has nothing to authorise, so the connection is live immediately.
   */
  @Get(':provider/connect')
  public async connect(
    @Owner() ownerId: string,
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const handshake = await this.begin({ ownerId, provider, returnTo });
    response.redirect(handshake.redirectUrl ?? this.webReturn(returnTo, provider));
  }

  /** The JSON twin of `connect`, for clients that would rather open the URL themselves. */
  @Get(':provider/connect-url')
  public async connectUrl(
    @Owner() ownerId: string,
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
  ): Promise<BeginConnectionDto> {
    return await this.begin({ ownerId, provider, returnTo });
  }

  /**
   * Composio appends `connected_account_id` to the callback. Passing it through is what makes
   * the flow correct when more than one connect attempt is in the air at once.
   *
   * Public because Composio's redirect is a third-party navigation: the session cookie is
   * `SameSite=Lax` so it does arrive, but the request must not fail for a user whose session
   * lapsed while they were on the consent screen. It completes a handshake this server started
   * and carries no user input beyond an account id Composio itself minted.
   */
  @Public()
  @Get(':provider/callback')
  public async callback(
    @Param('provider') provider: string,
    @Query() query: CallbackQuery,
    @Res() response: Response,
  ): Promise<void> {
    // The owner comes from the signed state we minted when the handshake began, never from the
    // session — a consent screen can outlive a session, and never from a plain query parameter,
    // which anyone could edit to attach their account to somebody else's workspace.
    const ownerId = this.handshakes.read(query.state);
    if (ownerId === undefined) throw new UnauthorizedException('This connection link has expired.');

    const accountId = query.connected_account_id;
    const active = await this.workspaces.for(ownerId).integrations.completeConnect({
      provider: this.parse(provider),
      ...(accountId === undefined ? {} : { externalAccountRef: accountId }),
    });
    response.redirect(`${this.webReturn(query.returnTo, provider)}&connected=${String(active)}`);
  }

  @Delete(':provider')
  public async disconnect(
    @Owner() ownerId: string,
    @Param('provider') provider: string,
  ): Promise<{ ok: true }> {
    await this.workspaces.for(ownerId).integrations.disconnect(this.parse(provider));
    return { ok: true };
  }

  private async begin(input: {
    ownerId: string;
    provider: string;
    returnTo: string | undefined;
  }): Promise<BeginConnectionDto> {
    const provider = this.parse(input.provider);
    const state = this.handshakes.mint(input.ownerId);
    const query = new URLSearchParams({ state });
    if (input.returnTo !== undefined) query.set('returnTo', input.returnTo);

    return await this.workspaces.for(input.ownerId).integrations.beginConnect({
      provider,
      callbackUrl: `${this.apiOrigin()}/api/integrations/${provider}/callback?${query.toString()}`,
    });
  }

  private parse(provider: string): SourceProvider {
    const upper = provider.toUpperCase();
    // Unknown means "no installed plugin claims this app", which is a client error rather than
    // a missing feature: the screen only ever offers what the catalog listed.
    if (!this.sources.providers().includes(upper)) {
      throw new BadRequestException(`Unknown provider "${provider}".`);
    }
    return upper;
  }

  /**
   * Composio redirects a browser here after consent, so this has to be the address the
   * deployment answers on rather than the one it binds to. It was `localhost` unconditionally,
   * which works on a laptop and sends every hosted user to their own machine.
   */
  private apiOrigin(): string {
    return siteUrl(this.config);
  }

  /**
   * Where the person ends up once the handshake is done. Built from the site URL for the same
   * reason as the callback: `WEB_ORIGIN` is a CORS allowlist whose value is legitimately a
   * wildcard, and a wildcard joined to a path is not a page anyone can land on.
   */
  private webReturn(returnTo: string | undefined, provider: string): string {
    return resolveReturnUrl({ returnTo, provider, site: siteUrl(this.config) });
  }
}
