import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { z } from 'zod';
import type { SettingsDto } from '@open-loops/contracts';
import { AccountIdentities } from '../../infrastructure/account-identity.service.js';
import { SettingsService } from './settings.service.js';
import { Owner } from '@open-loops/plugin-nest';

const patchSchema = z.object({
  schedules: z
    .array(
      z.object({
        kind: z.string().min(1).max(60),
        cron: z.string().min(1).max(120).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .max(50)
    .optional(),
  /** Opaque here; each value is checked against the schema its plugin registered. */
  plugins: z.array(z.object({ id: z.string().min(1).max(60), value: z.unknown() })).max(50).optional(),
  /** Bounded because it is a list somebody types; a handle is an address, not a paragraph. */
  handles: z.array(z.string().max(200)).max(50).optional(),
});

/**
 * One screen, three homes. Schedules are a table of their own, each plugin's preferences live in
 * that plugin's records, and the handles that make a signal "to me" are the account's identity
 * and live on its row — this is where they are shown and saved together, and the only place that
 * knows they are stored apart.
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
    // The stored list, not the effective one: the screen edits what it is shown, and the
    // sign-in address is not something anyone should remove from their own identity.
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
