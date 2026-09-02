import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import type { TodayDto } from '@open-loops/contracts';
import { asInstant } from '@open-loops/kernel';
import type { Clock } from '@open-loops/kernel';
import { asOpenLoopId } from '@open-loops/loops';
import { Tokens } from '../../tokens.js';
import { WorkspaceFactory } from '../../infrastructure/workspace.factory.js';
import { Owner } from '@open-loops/plugin-nest';

const snoozeSchema = z.object({ minutes: z.number().int().min(5).max(60 * 24).default(180) });
const reasonSchema = z.object({ reason: z.string().max(200).default('by hand') });

/**
 * Controllers translate HTTP into a use-case call and back. There is deliberately no logic
 * here — anything that looks like a rule belongs in a bounded context.
 */
@Controller('api')
export class LoopsController {
  public constructor(
    private readonly workspaces: WorkspaceFactory,
    @Inject(Tokens.Clock) private readonly clock: Clock,
  ) {}

  @Get('today')
  public async getToday(@Owner() ownerId: string): Promise<TodayDto> {
    return await this.workspaces.for(ownerId).today.execute();
  }

  @Get('loops')
  public async listLoops(@Owner() ownerId: string): Promise<TodayDto['items']> {
    return (await this.workspaces.for(ownerId).today.execute()).items;
  }

  @Post('loops/:id/:command')
  public async runCommand(
    @Owner() ownerId: string,
    @Param('id') id: string,
    @Param('command') command: string,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const { commands } = this.workspaces.for(ownerId);
    const loopId = asOpenLoopId(id);
    switch (command) {
      case 'snooze': {
        const { minutes } = snoozeSchema.parse(body ?? {});
        await commands.snooze({
          loopId,
          until: asInstant(this.clock.now() + minutes * 60_000),
        });
        break;
      }
      case 'drop':
        await commands.drop({ loopId, ...reasonSchema.parse(body ?? {}) });
        break;
      case 'done':
        await commands.confirmDone({ loopId, ...reasonSchema.parse(body ?? {}) });
        break;
      case 'reopen':
        await commands.reopen(loopId);
        break;
      default:
        throw new BadRequestException(`Unknown command "${command}".`);
    }
    return { ok: true };
  }
}
