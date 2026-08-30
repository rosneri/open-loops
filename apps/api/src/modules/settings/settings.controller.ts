import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { z } from 'zod';
import type { SettingsDto } from '@open-loops/contracts';
import { AccountIdentities } from '../../infrastructure/account-identity.service.js';
import { Owner } from '../auth/owner.decorator.js';
import { SettingsService } from './settings.service.js';

const patchSchema = z.object({
  sweepCron: z.string().min(1).max(120).optional(),
  podcastCron: z.string().min(1).max(120).optional(),
  podcastEnabled: z.boolean().optional(),
  podcastLength: z.enum(['short', 'default', 'long']).optional(),
  podcastHostVoiceId: z.string().max(120).optional(),
  podcastGuestVoiceId: z.string().max(120).optional(),
  /** Bounded because it is a list somebody types; a handle is an address, not a paragraph. */
  handles: z.array(z.string().max(200)).max(50).optional(),
});

/**
 * One screen, two homes. Schedules and podcast preferences are settings; the handles that make a
 * signal "to me" are the account's identity and live on its row — this is where they are shown
 * and saved together, and the only place that knows they are stored apart.
 */
@Controller('api/settings')
export class SettingsController {
  public constructor(
    private readonly settings: SettingsService,
    private readonly identities: AccountIdentities,
  ) {}

  @Get()
  public async read(@Owner() ownerId: string): Promise<SettingsDto> {
    const [settings, identity] = await Promise.all([
      this.settings.view(ownerId),
      this.identities.identity(ownerId),
    ]);
    // The stored list, not the effective one: the screen edits what it is shown, and a username
    // is not something anyone should be able to remove from their own identity.
    return { ...settings, handles: identity.handles };
  }

  /** A partial update: the screen sends only what changed, so two fields never fight. */
  @Put()
  public async write(@Owner() ownerId: string, @Body() body: unknown): Promise<SettingsDto> {
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const identity =
      parsed.data.handles === undefined
        ? await this.identities.identity(ownerId)
        : await this.identities.setHandles(ownerId, parsed.data.handles);

    return { ...(await this.settings.update(ownerId, parsed.data)), handles: identity.handles };
  }
}
