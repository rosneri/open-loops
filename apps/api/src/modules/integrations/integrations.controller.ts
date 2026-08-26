import { Controller, Delete, Get, Inject, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { BeginConnectionDto, IntegrationDto } from '@open-loops/contracts';
import { isSourceProvider, type SourceProvider } from '@open-loops/kernel';
import { BadRequestException } from '@nestjs/common';
import type { ManageIntegrationsUseCase } from '@open-loops/orchestration';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';

@Controller('api/integrations')
export class IntegrationsController {
  public constructor(
    @Inject(Tokens.ManageIntegrations) private readonly integrations: ManageIntegrationsUseCase,
    @Inject(Tokens.Config) private readonly config: AppConfig,
  ) {}

  @Get()
  public async list(): Promise<readonly IntegrationDto[]> {
    return await this.integrations.list();
  }

  /**
   * One click to connect. Hosted mode returns a Composio consent URL — Composio owns the OAuth
   * application, which is why no redirect URI is ever registered in Slack, GitHub or Google.
   * Local mode has nothing to authorise, so the connection is live immediately.
   */
  @Get(':provider/connect')
  public async connect(
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const handshake = await this.begin({ provider, returnTo });
    response.redirect(handshake.redirectUrl ?? this.webReturn(returnTo, provider));
  }

  /** The JSON twin of `connect`, for clients that would rather open the URL themselves. */
  @Get(':provider/connect-url')
  public async connectUrl(
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
  ): Promise<BeginConnectionDto> {
    return await this.begin({ provider, returnTo });
  }

  @Get(':provider/callback')
  public async callback(
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const active = await this.integrations.completeConnect(this.parse(provider));
    response.redirect(`${this.webReturn(returnTo, provider)}&connected=${String(active)}`);
  }

  @Delete(':provider')
  public async disconnect(@Param('provider') provider: string): Promise<{ ok: true }> {
    await this.integrations.disconnect(this.parse(provider));
    return { ok: true };
  }

  private async begin(input: {
    provider: string;
    returnTo: string | undefined;
  }): Promise<BeginConnectionDto> {
    const provider = this.parse(input.provider);
    return await this.integrations.beginConnect({
      provider,
      callbackUrl: `${this.apiOrigin()}/api/integrations/${provider}/callback${
        input.returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(input.returnTo)}`
      }`,
    });
  }

  private parse(provider: string): SourceProvider {
    const upper = provider.toUpperCase();
    if (!isSourceProvider(upper)) throw new BadRequestException(`Unknown provider "${provider}".`);
    return upper;
  }

  private apiOrigin(): string {
    return `http://localhost:${this.config.PORT}`;
  }

  private webReturn(returnTo: string | undefined, provider: string): string {
    const base = returnTo ?? `${this.config.WEB_ORIGIN.split(',')[0] ?? ''}/integrations`;
    return `${base}?provider=${provider}`;
  }
}
