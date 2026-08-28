import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { AppConfig } from '../../config/env.js';
import { aiModel, aiProvider } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { Public } from '../auth/public.decorator.js';
import type { RequestWithUser } from '../auth/jwt-auth.guard.js';

@Controller('api/health')
export class HealthController {
  public constructor(@Inject(Tokens.Config) private readonly config: AppConfig) {}

  /**
   * Public so an uptime check needs no credentials, but the configuration details behind it —
   * which describe the deployment — are only returned to a caller that is signed in.
   */
  @Public()
  @Get()
  public health(@Req() request: RequestWithUser): Record<string, unknown> {
    if (request.user === undefined) return { ok: true };
    return {
      ok: true,
      mode: this.config.OPEN_LOOPS_MODE,
      timeZone: this.config.OPEN_LOOPS_TIMEZONE,
      composio: this.config.COMPOSIO_API_KEY === undefined ? 'absent' : 'configured',
      model: `${aiProvider(this.config)}/${aiModel(this.config)}`,
    };
  }
}
