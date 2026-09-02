import { Body, Controller, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { asOpenLoopId } from '@open-loops/loops';
import type { AppConfig } from '../../config/env.js';
import { Tokens } from '../../tokens.js';
import { WorkspaceFactory } from '../../infrastructure/workspace.factory.js';
import { Owner } from '@open-loops/plugin-nest';

const reorderSchema = z.object({
  order: z.array(z.string().min(1)).min(1).max(200),
});

@Controller('api/plan')
export class PlanController {
  public constructor(
    private readonly workspaces: WorkspaceFactory,
    @Inject(Tokens.Config) private readonly config: AppConfig,
  ) {}

  @Post('rebalance')
  public async rebalanceDay(
    @Owner() ownerId: string,
  ): Promise<{ day: string; blocks: number; deferred: number }> {
    const result = await this.workspaces.for(ownerId).rebalance.execute({
      startMinute: this.config.DAY_START_MINUTE,
      endMinute: this.config.DAY_END_MINUTE,
    });
    return { day: result.day, blocks: result.blocks.length, deferred: result.deferred };
  }

  /**
   * Dragging the list writes a manual rank per loop and then re-plans, so the user's order
   * survives every later tick instead of being recomputed away.
   */
  @Post('reorder')
  public async reorder(@Owner() ownerId: string, @Body() body: unknown): Promise<{ ok: true }> {
    const { commands, rebalance } = this.workspaces.for(ownerId);
    const { order } = reorderSchema.parse(body);
    for (const [rank, id] of order.entries()) {
      await commands.reorder({ loopId: asOpenLoopId(id), rank });
    }
    await rebalance.execute({
      startMinute: this.config.DAY_START_MINUTE,
      endMinute: this.config.DAY_END_MINUTE,
    });
    return { ok: true };
  }
}
