import type { ComponentType } from 'react';

/**
 * The client's authenticated fetch, handed to a panel so a plugin never re-implements the
 * session handling, the 401 hand-off or the timeout. `slow` widens the timeout for work that
 * legitimately takes minutes — recording audio, running a sweep.
 */
export type PluginRequest = <TResult>(
  path: string,
  init?: RequestInit,
  options?: { readonly slow?: boolean },
) => Promise<TResult>;

/**
 * What the Settings screen hands a plugin's panel. `value` is this plugin's saved settings with
 * the unsaved edits laid over them, exactly as the core's own fields are shown; `onEdit` puts a
 * whole new value into the draft, and the one Save button at the bottom writes it.
 */
export interface SettingsPanelProps<TValue = unknown> {
  readonly value: TValue;
  readonly onEdit: (value: TValue) => void;
  /** True while any save or action on the screen is in flight; disable what would collide. */
  readonly busy: boolean;
  readonly request: PluginRequest;
}

export interface SettingsPanel<TValue = unknown> {
  /** The heading above the panel: "Podcast of the day". */
  readonly label: string;
  readonly Panel: ComponentType<SettingsPanelProps<TValue>>;
  /**
   * The source this panel belongs to, when it is really part of connecting one. Such a panel is
   * shown on that provider's Integrations card — where the question is actually being asked —
   * and deliberately not on the Settings screen, so there is one place to answer it rather than
   * two that can disagree.
   */
  readonly provider?: string;
}

export interface PageProps {
  readonly request: PluginRequest;
}

/**
 * A screen of the plugin's own, with a tab in the header. `path` is the route it answers on —
 * `/digest` — and the shell hands it the authenticated fetch and nothing else, because a page
 * that needs more than the API is a page that has grown a second app.
 */
export interface PluginPage {
  readonly path: `/${string}`;
  readonly label: string;
  readonly Page: ComponentType<PageProps>;
}

/**
 * A plugin's contribution to the client. Imported by the web app the same way the API imports
 * the server half — listed, not discovered — so the bundler sees through it and a typo is a
 * compile error. Kept apart from the server entry so no plugin drags Nest into the browser.
 */
export interface WebPlugin {
  readonly id: string;
  readonly settings?: SettingsPanel;
  readonly pages?: readonly PluginPage[];
}

/**
 * Checks the panel against its own value type where the plugin is written, then erases it: the
 * screen that mounts every panel holds each plugin's value as `unknown`, because the server
 * validated it against the schema that plugin registered and the client has no second copy.
 */
export const defineWebPlugin = <TValue>(plugin: {
  readonly id: string;
  readonly settings?: SettingsPanel<TValue>;
  readonly pages?: readonly PluginPage[];
}): WebPlugin => plugin as unknown as WebPlugin;
