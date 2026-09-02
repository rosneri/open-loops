import type { ZodType } from 'zod';

/**
 * A plugin's slice of the Settings screen. The schema is the contract in both directions: it
 * validates what the screen submits and it is what the screen renders itself from, so a new
 * field is one declaration rather than a DTO, a column, a form control and a validator.
 */
export interface SettingsFragment<TValue = unknown> {
  readonly schema: ZodType<TValue>;
  readonly defaults: TValue;
  /** The heading above this plugin's fields. */
  readonly label: string;
}

export interface SettingsRegistry {
  register<TValue>(fragment: SettingsFragment<TValue>): void;
}

/**
 * Where a plugin's saved settings live in its own record store: one collection, one key. Named
 * here so the scope that reads them and the screen that writes them cannot disagree about it.
 */
export const PLUGIN_SETTINGS_RECORD = { collection: '__settings', key: 'value' } as const;
