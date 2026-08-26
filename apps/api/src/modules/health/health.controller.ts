import { Controller, Get, Inject } from '@nestjs/common';
import type { AppConfig } from '../../config/env.js';
import { aiModel, aiProvider } from '../../config/env.js';
import { Tokens } from '../../tokens.js';

@Controller('api/health')
export class HealthController {
  public constructor(@Inject(Tokens.Config) private readonly config: AppConfig) {}

  /** Cheap enough to poll, and it reports the two facts that explain most misbehaviour. */
  @Get()
  public health(): Record<string, unknown> {
    return {
      ok: true,
      mode: this.config.OPEN_LOOPS_MODE,
      timeZone: this.config.OPEN_LOOPS_TIMEZONE,
      composio: this.config.COMPOSIO_API_KEY === undefined ? 'absent' : 'configured',
      model: `${aiProvider(this.config)}/${aiModel(this.config)}`,
    };
  }
}
