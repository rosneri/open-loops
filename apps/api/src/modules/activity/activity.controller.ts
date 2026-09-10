import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { ActivityRunDto, ActivityRunSummaryDto } from '@open-loops/contracts';
import { Owner } from '@open-loops/plugin-nest';
import { WorkspaceFactory } from '../../infrastructure/workspace.factory.js';

/** Enough history to answer "what happened last night" without paging, and a ceiling. */
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

/**
 * What the sweeps did. Read-only and per owner by construction — the store is built for one
 * account and cannot express a question about another, so there is no filtering to forget here.
 */
@Controller('api/activity')
export class ActivityController {
  public constructor(private readonly workspaces: WorkspaceFactory) {}

  @Get()
  public async list(
    @Owner() ownerId: string,
    @Query('limit') limit: string | undefined,
  ): Promise<readonly ActivityRunSummaryDto[]> {
    return await this.workspaces.for(ownerId).runs.list({ limit: readLimit(limit) });
  }

  @Get(':id')
  public async detail(
    @Owner() ownerId: string,
    @Param('id') id: string,
  ): Promise<ActivityRunDto> {
    const run = await this.workspaces.for(ownerId).runs.findById(id);
    // A run belonging to somebody else is not found rather than forbidden: saying "forbidden"
    // would confirm the id exists, which is a fact about another account.
    if (run === undefined) throw new NotFoundException('No such run.');
    return run;
  }
}

const readLimit = (raw: string | undefined): number => {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
};
