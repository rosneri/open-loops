import type { Clock, Logger, SourceProvider } from '@open-loops/kernel';
import type { IntegrationRepository } from '@open-loops/integrations';
import { ConnectionStatus } from '@open-loops/integrations';
import type { OpenLoopRepository } from '@open-loops/loops';
import { isTerminal } from '@open-loops/loops';

export interface PruneDisconnectedDeps {
  readonly integrations: IntegrationRepository;
  readonly loops: OpenLoopRepository;
  readonly clock: Clock;
  readonly logger: Logger;
}

export interface PruneDisconnectedResult {
  readonly pruned: number;
  readonly providers: readonly SourceProvider[];
}

/**
 * Disconnecting an app has to mean something. Until now it stopped the fetching and left the
 * loops: a day still full of pull requests from a GitHub nobody is watching any more, each one
 * quietly unverifiable, because the probes that would close them need the connection that was
 * just taken away. They cannot be confirmed and they cannot be dismissed as noise, which is the
 * one state this product exists to prevent.
 *
 * So a sweep drops what is still live from a disconnected source, and keeps what already
 * happened. A finished loop is a record — of what was owed, and that it was settled — and
 * nothing about disconnecting an app makes that untrue. An open one is a claim about the
 * present that nothing can check any more.
 *
 * Only `DISCONNECTED` counts. `FAILED` and `EXPIRED` are a bad afternoon — an API blip, a token
 * to refresh — and deleting somebody's open work over a transient error would be far worse than
 * leaving it. This runs on the sweep, not on the disconnect itself, so a mistaken click has a
 * whole cycle to be undone by reconnecting.
 */
export class PruneDisconnectedUseCase {
  public constructor(private readonly deps: PruneDisconnectedDeps) {}

  public async execute(): Promise<PruneDisconnectedResult> {
    const stored = await this.deps.integrations.listAll();
    const disconnected = stored
      .filter((integration) => integration.snapshot().status === ConnectionStatus.Disconnected)
      .map((integration) => integration.provider);
    if (disconnected.length === 0) return { pruned: 0, providers: [] };

    const now = this.deps.clock.now();
    const loops = await this.deps.loops.list({ providers: disconnected });
    const live = loops.filter((loop) => !isTerminal(loop.view(now).status));

    for (const loop of live) await this.deps.loops.delete(loop.id);

    if (live.length > 0) {
      this.deps.logger.info('pruned loops from disconnected sources', {
        providers: disconnected,
        pruned: live.length,
        // What was kept, and why the count above is not the whole story.
        keptAsHistory: loops.length - live.length,
      });
    }
    return { pruned: live.length, providers: disconnected };
  }
}
