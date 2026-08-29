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
   * What the deployment can actually honour. The client shows this rather than pretending every
   * schedule is possible: a Vercel Hobby cron fires once a day, so a five-minute sweep is only
   * real when something else is doing the scheduling.
   */
  readonly schedulerKind: 'IN_PROCESS' | 'PLATFORM_CRON';
  readonly podcastConfigured: boolean;
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
}
