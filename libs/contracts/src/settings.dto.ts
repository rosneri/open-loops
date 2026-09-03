/**
 * One kind of scheduled work, as the Settings screen shows it. The screen renders this list
 * rather than a fixed pair of fields, so a plugin that registers a third kind of work gets a
 * cron field without anybody editing a form.
 */
export interface ScheduleDto {
  readonly kind: string;
  readonly label: string;
  /** One line under the field saying what this actually does when it fires. */
  readonly description: string;
  /** A cron expression, read in the account's zone. */
  readonly cron: string;
  readonly enabled: boolean;
  /**
   * Whether the work behind it can actually run — a podcast with no audio store cannot. A
   * schedule that is offered but could never succeed is worse than one that is not offered.
   */
  readonly available: boolean;
}

/**
 * One plugin's slice of the Settings screen. The value is opaque to the core: the plugin
 * registered the schema it is validated against and ships the panel that edits it, and neither
 * this DTO nor the screen that carries it knows what is inside.
 */
export interface PluginSettingsDto {
  readonly id: string;
  readonly label: string;
  readonly value: unknown;
}

export interface SettingsDto {
  readonly schedules: readonly ScheduleDto[];
  readonly plugins: readonly PluginSettingsDto[];
  readonly timeZone: string;
  /**
   * Who holds the clock. `EXTERNAL` means a separate always-on scheduler reads these schedules
   * and calls back in, which is what makes an arbitrary cron expression honourable from a
   * serverless deployment that could otherwise only manage one platform cron a day.
   */
  readonly schedulerKind: 'EXTERNAL';
  /**
   * The names this account answers to across providers — what makes a message "to me" rather
   * than about someone else. Per account, so one person's addresses never speak for another's.
   * The sign-in address is always one of them and is not editable.
   */
  readonly handles: readonly string[];
  readonly updatedAt: number;
}

/**
 * Every field admits `undefined` explicitly: a partial update is built by omitting keys, and
 * under `exactOptionalPropertyTypes` an optional key is not the same as one holding `undefined`.
 */
export interface UpdateScheduleDto {
  readonly kind: string;
  readonly cron?: string | undefined;
  readonly enabled?: boolean | undefined;
}

/** A whole value, not a patch: the plugin's panel holds the entire object and hands it back. */
export interface UpdatePluginSettingsDto {
  readonly id: string;
  readonly value: unknown;
}

export interface UpdateSettingsDto {
  readonly schedules?: readonly UpdateScheduleDto[] | undefined;
  readonly plugins?: readonly UpdatePluginSettingsDto[] | undefined;
  readonly handles?: readonly string[] | undefined;
}
