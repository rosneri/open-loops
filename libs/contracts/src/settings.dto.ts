/** What the Settings screen reads and writes. Schedules are cron expressions in the app's zone. */
export type PodcastLengthDto = 'short' | 'default' | 'long';

export interface SettingsDto {
  readonly sweepCron: string;
  readonly podcastCron: string;
  readonly podcastEnabled: boolean;
  readonly podcastLength: PodcastLengthDto;
  readonly podcastHostVoiceId?: string;
  readonly podcastGuestVoiceId?: string;
  readonly timeZone: string;
  /**
   * Who holds the clock. `EXTERNAL` means a separate always-on scheduler reads these schedules
   * and calls back in, which is what makes an arbitrary cron expression honourable from a
   * serverless deployment that could otherwise only manage one platform cron a day.
   */
  readonly schedulerKind: 'EXTERNAL';
  readonly podcastConfigured: boolean;
  /**
   * The names this account answers to across providers — what makes a message "to me" rather
   * than about someone else. Per account, so one person's addresses never speak for another's.
   * The username is always one of them and is not editable.
   */
  readonly handles: readonly string[];
  readonly updatedAt: number;
}

/**
 * Every field admits `undefined` explicitly: a partial update is built by omitting keys, and
 * under `exactOptionalPropertyTypes` an optional key is not the same as one holding `undefined`.
 */
export interface UpdateSettingsDto {
  readonly sweepCron?: string | undefined;
  readonly podcastCron?: string | undefined;
  readonly podcastEnabled?: boolean | undefined;
  readonly podcastLength?: PodcastLengthDto | undefined;
  readonly podcastHostVoiceId?: string | undefined;
  readonly podcastGuestVoiceId?: string | undefined;
  readonly handles?: readonly string[] | undefined;
}
