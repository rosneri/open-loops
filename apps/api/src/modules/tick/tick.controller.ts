import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import type { TickReportDto } from '@open-loops/contracts';
import { WorkspaceFactory } from '../../infrastructure/workspace.factory.js';
import { USER_HEADER } from '../agent/agent.controller.js';
import { OwnerResolver } from '../auth/owner-resolver.service.js';
import { SessionOrTokenGuard } from '../auth/session-or-token.guard.js';
import { Public, type RequestWithUser } from '@open-loops/plugin-nest';

/**
 * Two callers: the button in the client, which has a session and means itself, and the
 * scheduler, which has the shared secret and names the account in a header. `@Public()` waives
 * the global guard so the composite below can accept either.
 */
@Controller('api/tick')
@Public()
@UseGuards(SessionOrTokenGuard)
export class TickController {
  public constructor(
    private readonly workspaces: WorkspaceFactory,
    private readonly owners: OwnerResolver,
  ) {}

  @Post()
  public async run(
    @Req() request: RequestWithUser,
    @Headers(USER_HEADER) username: string | undefined,
    @Body() _body: unknown,
  ): Promise<TickReportDto> {
    const ownerId = request.user?.id ?? (await this.owners.resolve(username));
    return await this.workspaces.for(ownerId).tick.execute();
  }
}
