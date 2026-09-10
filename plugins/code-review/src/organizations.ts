import type { OwnerScope, SetupStep } from '@open-loops/plugin-api';
import type { CodeReviewSettings } from './settings.js';

/** One organisation the connected GitHub account belongs to, as the picker shows it. */
export interface Organization {
  readonly login: string;
  readonly description?: string;
}

/** The route the Settings panel asks for the list on. Stated once so both halves agree. */
export const ORGANIZATIONS_ROUTE = '/api/code-review/organizations';

export interface OrganizationsDto {
  /** Empty with `connected: false` means "nothing to list yet", not "you are in none". */
  readonly organizations: readonly Organization[];
  readonly connected: boolean;
}

/**
 * Asks the connected GitHub account which organisations it belongs to. Said in words, because
 * that is the contract with the broker: the tool that answers this has been renamed twice and a
 * slug baked in here would have broken both times.
 */
export const listOrganizations = async (scope: OwnerScope): Promise<OrganizationsDto> => {
  if (scope.tools === undefined) return NOT_CONNECTED;

  try {
    const result = await scope.tools.execute({
      query: 'list the GitHub organizations the authenticated user belongs to',
      providers: ['GITHUB'],
    });
    if (result?.ok !== true) {
      scope.logger.warn('could not list github organizations', { error: result?.error });
      return NOT_CONNECTED;
    }
    return { organizations: readOrganizations(result.data), connected: true };
  } catch (error) {
    // An account with no GitHub connection is the ordinary case here — the broker answers a
    // tool call for an unconnected app by throwing — and it is a panel that says "connect it",
    // never a 500 on a settings screen somebody opened to change the podcast voice.
    scope.logger.warn('github could not be asked for organizations', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NOT_CONNECTED;
  }
};

const NOT_CONNECTED: OrganizationsDto = { organizations: [], connected: false };

/**
 * Finds the organisations in whatever came back. The shape is the broker's rather than ours and
 * it nests differently per tool version, so this looks for the one field GitHub always uses for
 * an account's name instead of a path that would have to be corrected each time.
 *
 * Deduplicated case-insensitively and sorted, because the same organisation can appear in two
 * branches of one response — as a membership and as a repository's owner — and the picker must
 * not offer it twice.
 */
export const readOrganizations = (payload: unknown): readonly Organization[] => {
  const found = new Map<string, Organization>();

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (typeof node !== 'object' || node === null) return;

    const record = node as Record<string, unknown>;
    const login = record['login'];
    // A user is not an organisation: GitHub says so on every account object that has the field.
    if (typeof login === 'string' && login.length > 0 && record['type'] !== 'User') {
      const description = record['description'];
      const key = login.toLowerCase();
      if (!found.has(key)) {
        found.set(key, {
          login,
          ...(typeof description === 'string' && description.length > 0 ? { description } : {}),
        });
      }
    }
    for (const value of Object.values(record)) walk(value);
  };

  walk(payload);
  return [...found.values()].sort((a, b) => a.login.localeCompare(b.login));
};

/**
 * The clause appended to this plugin's fetch intents for someone who has picked organisations.
 * Written the way the rest of the intent is — as a sentence, not a filter expression — because
 * what reads it is a model choosing a tool call, not a query planner.
 */
export const focusPhrase = (
  organizations: readonly string[],
  includePersonal = false,
): string | undefined => {
  const named = organizations.map((login) => login.trim()).filter((login) => login.length > 0);
  // Nothing named is already everything, and everything includes this account's own
  // repositories — so the checkbox has nothing left to add and saying so would only narrow it.
  if (named.length === 0) return undefined;
  // `join` rather than an index: the last element of a non-empty array is a fact TypeScript
  // cannot see, and asserting it here would be the only assertion in this plugin.
  const list =
    named.length === 1
      ? named.join('')
      : `${named.slice(0, -1).join(', ')} or ${named.slice(-1).join('')}`;
  const scope = `the ${list} ${named.length === 1 ? 'organization' : 'organizations'}`;
  return `limited to repositories owned by ${scope}${
    includePersonal ? ' or by my own personal account' : ''
  } on GitHub`;
};

/**
 * The question GitHub asks before it will finish connecting. Asked during the connection rather
 * than left to a settings screen: an account that belongs to four organisations and syncs all of
 * them produces a day made mostly of other people's work, and the wrong answer here does not
 * look like an error — it looks like the app.
 */
export const githubSetupStep = (): SetupStep => ({
  label: 'Choose which GitHub organisations count',
  complete: async (scope: OwnerScope): Promise<boolean> => {
    const settings = await scope.settings<CodeReviewSettings>();
    // Ticking only "my own repositories" is a deliberate answer too, even with no organisation
    // chosen: it says the personal account is the whole of what counts.
    if (settings.organizations.length > 0 || settings.includePersonal) return true;
    // Nothing chosen is only a question when there is something to choose. An account in no
    // organisations — or one GitHub will not tell us about, which is what a token without
    // `read:org` looks like — must not be gated behind a picker with no options.
    const { organizations } = await listOrganizations(scope);
    return organizations.length === 0;
  },
});
