import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ScheduleCatalog, ScheduledKind } from '@open-loops/plugin-host';
import { Tokens } from '../../tokens.js';
import type { BuiltInSchedules } from './built-in-schedules.js';
import { WorkspaceFactory } from '../../infrastructure/workspace.factory.js';

/**
 * What can be put on a clock, for one person. One kind is the product's own — the sweep is the
 * heartbeat — and the rest are whatever the installed plugins registered. Everything downstream,
 * the Settings screen and the external scheduler alike, sees one uniform list and no longer
 * knows the names of any particular kind of work.
 */
@Injectable()
export class SchedulesService {
  public constructor(
    private readonly workspaces: WorkspaceFactory,
    @Inject(Tokens.BuiltInSchedules) private readonly builtIn: BuiltInSchedules,
    @Inject(Tokens.ScheduleCatalog) private readonly catalog: ScheduleCatalog,
  ) {}

  public kinds(ownerId: string): readonly ScheduledKind[] {
    const workspace = this.workspaces.for(ownerId);
    return [...this.builtIn(workspace), ...this.catalog.kinds(workspace.scopeFor)];
  }

  /** Runs one kind now. The scheduler calls this; so does the "run it now" button. */
  public async run(ownerId: string, kind: string): Promise<void> {
    const found = this.kinds(ownerId).find((candidate) => candidate.kind === kind);
    if (found === undefined) throw new NotFoundException(`No schedule named "${kind}".`);
    await found.run();
  }
}
