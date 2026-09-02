import type { OwnerScope } from '../context.js';

/**
 * Work that runs on a clock the user owns. The sweep and the podcast were two hard-coded kinds
 * in three places — the settings row, the settings screen and the external scheduler — so a
 * third kind meant editing all three. A registration is what the scheduler enumerates instead.
 */
export interface ScheduleDefinition {
  readonly kind: string;
  /** Shown beside the cron field: "Sweep", "Podcast". */
  readonly label: string;
  /** One line under the field saying what this actually does when it fires. */
  readonly description: string;
  /** Seeds the row on a fresh install and is ignored afterwards; the database holds the truth. */
  readonly defaultCron: string;
  /** Whether a fresh account has it switched on. Off is the right default for anything noisy. */
  readonly enabledByDefault?: boolean | undefined;
  /**
   * Whether the work could actually succeed on this deployment — a podcast with no audio store
   * cannot. Offering a schedule that could never run is worse than not offering it.
   */
  available?(scope: OwnerScope): boolean;
  run(scope: OwnerScope): Promise<void>;
}

export interface ScheduleRegistry {
  register(definition: ScheduleDefinition): void;
}
