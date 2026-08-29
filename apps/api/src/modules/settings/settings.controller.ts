import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { z } from 'zod';
import type { SettingsDto } from '@open-loops/contracts';
import { Owner } from '../auth/owner.decorator.js';
import { SettingsService } from './settings.service.js';

const patchSchema = z.object({
  sweepCron: z.string().min(1).max(120).optional(),
  podcastCron: z.string().min(1).max(120).optional(),
  podcastEnabled: z.boolean().optional(),
  podcastLength: z.enum(['short', 'default', 'long']).optional(),
  podcastHostVoiceId: z.string().max(120).optional(),
  podcastGuestVoiceId: z.string().max(120).optional(),
});

@Controller('api/settings')
export class SettingsController {
  public constructor(private readonly settings: SettingsService) {}

  @Get()
  public async read(@Owner() ownerId: string): Promise<SettingsDto> {
    return await this.settings.view(ownerId);
  }

  /** A partial update: the screen sends only what changed, so two fields never fight. */
  @Put()
  public async write(@Owner() ownerId: string, @Body() body: unknown): Promise<SettingsDto> {
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return await this.settings.update(ownerId, parsed.data);
  }
}
