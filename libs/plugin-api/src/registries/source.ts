import type { OwnerScope } from '../context.js';

/**
 * A place work arrives from. Adding one used to mean editing a union in the kernel, a table of
 * toolkit slugs in a session file and a table of fetch intents in a connector — three files in
 * three libraries, none of which knew about the other two. All three facts are stated here, once,
 * by whoever actually knows them.
 *
 * The provider id is the string every layer already speaks: `Integration.provider`,
 * `SyncCursor.provider` and `RawSignal.provider` are plain columns, so a new source is a
 * registration rather than a migration.
 */
export interface SourceDefinition {
  readonly provider: string;
  /** What the Integrations screen calls it. */
  readonly label: string;
  /**
   * The broker's own name for this app. `undefined` means there is no hosted connection to make:
   * RiseUp is a real source that arrives by push from the local agent, and offering a "Connect"
   * button for it would be a lie.
   */
  readonly toolkit?: string | undefined;
  /**
   * What to ask the broker for, in words, to fetch this provider's recent signals. Phrased as an
   * intent rather than a tool name, so a renamed or replaced upstream tool keeps working.
   *
   * Each intent must name its provider out loud. Tool search treats the toolkit as a ranking hint
   * rather than a filter, so "list issues assigned to me" alone will happily return a Linear tool
   * during a GitHub sync; saying "on GitHub" is what pins it.
   */
  readonly intents?: readonly string[] | undefined;
  /**
   * A narrowing this particular person has asked for, in words, appended to each intent when
   * their sources are fetched — "in the acme or beta organisations". It is a function of the
   * owner because the intents are a fact about the app and the narrowing is a fact about the
   * account: one is written once by whoever knows GitHub, the other is a setting somebody saved
   * on a Tuesday. `undefined` is the normal answer and means "everything you can see".
   *
   * Called once per sync, not cached: a setting saved on the Settings screen must take effect on
   * the next tick rather than on the next deploy.
   */
  focus?(scope: OwnerScope): Promise<string | undefined>;
  /**
   * A second call per listed row, for a source whose list tool returns headlines and keeps the
   * part worth reading behind a detail call. Wispr Flow is why it exists: `search_meetings`
   * returns a title and an attendee preview, while the action items — the only part a loop can
   * be made of — live in `get_meeting`'s summary.
   *
   * Absent means one call, which is what every other source wants and what they all did before
   * this existed.
   */
  readonly hydrate?: HydrateDefinition | undefined;
  /**
   * A question this source cannot be connected without answering. GitHub is why it exists: an
   * account that belongs to four organisations and syncs all of them fills somebody's day with
   * three other teams' pull requests, and the moment to ask is while they are connecting it —
   * not on a settings screen they may never open.
   */
  readonly setup?: SetupStep | undefined;
}

/**
 * A post-consent step, owned by the plugin that knows what is being asked. Deliberately not a
 * form definition: the plugin already renders its own settings panel, and this only decides
 * whether the connection is allowed to finish.
 */
export interface SetupStep {
  /** What the Integrations card says is still missing, in words the person will recognise. */
  readonly label: string;
  /**
   * Whether this owner has answered. True also means "there was nothing to ask" — an account in
   * no organisations must not be gated behind a picker with no options, and only the plugin
   * knows the difference between "chose nothing" and "had nothing to choose".
   */
  complete(scope: OwnerScope): Promise<boolean>;
}

/**
 * How to expand one row of a list into the thing it summarises. Phrased as an intent for the
 * same reason the fetch intents are: the detail tool can be renamed upstream without this
 * changing.
 */
export interface HydrateDefinition {
  /** What to ask the broker for, in words, to expand one row. Must name its provider out loud. */
  readonly intent: string;
  /**
   * Where the row keeps its id, tried in order — the first one present wins. A list is a list
   * because upstream spells it `meeting_id` on one tool and `id` on the next.
   */
  readonly idKeys: readonly string[];
  /** What the detail tool calls that id among its arguments. */
  readonly argument: string;
  /**
   * How many rows to expand per sync. One tick is not the place to page a year of history, and
   * each expansion is a billed round trip.
   */
  readonly limit?: number;
}

export interface SourceRegistry {
  register(definition: SourceDefinition): void;
}
