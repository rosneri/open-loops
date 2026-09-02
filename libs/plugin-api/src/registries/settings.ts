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
