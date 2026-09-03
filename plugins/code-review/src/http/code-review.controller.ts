import { Controller, Get } from '@nestjs/common';
import { InjectPluginScopes, Owner, type PluginScopes } from '@open-loops/plugin-nest';
import { listOrganizations, type OrganizationsDto } from '../organizations.js';

/**
 * One route: which GitHub organisations this account belongs to, so the Settings panel can offer
 * them rather than asking somebody to remember how a slug is spelled. It is behind the session
 * like everything else the host mounts, and it reaches GitHub as this account and no other.
 */
@Controller('api/code-review')
export class CodeReviewController {
  public constructor(
    @InjectPluginScopes('code-review') private readonly scopes: PluginScopes,
  ) {}

  @Get('organizations')
  public async organizations(@Owner() ownerId: string): Promise<OrganizationsDto> {
    return await listOrganizations(this.scopes.for(ownerId));
  }
}
