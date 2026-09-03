import { useCallback, useEffect, useState } from 'react';
import { defineWebPlugin, type SettingsPanelProps } from '@open-loops/plugin-ui';
import { ORGANIZATIONS_ROUTE, type Organization, type OrganizationsDto } from '../organizations.js';
import type { CodeReviewSettings } from '../settings.js';

/**
 * Which GitHub organisations count towards the day. The list is the account's own, read from
 * GitHub through the connected app rather than typed: an organisation slug is something people
 * recognise and cannot spell, and a typo here is not an error — it is a filter that silently
 * matches nothing.
 *
 * Nothing ticked is every organisation, which is what this looked like before the setting
 * existed and is the right default for somebody who only belongs to one.
 */
function CodeReviewPanel({
  value,
  onEdit,
  busy,
  request,
}: SettingsPanelProps<CodeReviewSettings>): React.ReactElement {
  const [available, setAvailable] = useState<readonly Organization[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [error, setError] = useState<string | undefined>();

  const load = useCallback((): void => {
    setState('loading');
    setError(undefined);
    request<OrganizationsDto>(ORGANIZATIONS_ROUTE, undefined, { slow: true })
      .then((result) => {
        setAvailable(result.organizations);
        setState(result.connected ? 'ready' : 'unavailable');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setState('unavailable');
      });
  }, [request]);

  useEffect(load, [load]);

  const toggle = (login: string): void => {
    onEdit({
      ...value,
      organizations: value.organizations.includes(login)
        ? value.organizations.filter((entry) => entry !== login)
        : [...value.organizations, login],
    });
  };

  /*
   * An organisation that was picked and is no longer in the list — the account left it, or
   * GitHub is not answering right now — is still shown, and still ticked. Dropping it silently
   * would change what the sync fetches without anybody asking.
   */
  const rows: readonly Organization[] = [
    ...available,
    ...value.organizations
      .filter((login) => !available.some((org) => org.login === login))
      .map((login) => ({ login })),
  ];

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-chalk-600">
        {value.organizations.length === 0
          ? 'Every organisation this account can see is counted. Pick some to narrow it.'
          : 'Only the ticked organisations are fetched; their repositories are what becomes a loop.'}
      </p>

      {state === 'loading' && rows.length === 0 && (
        <p className="text-[11px] text-chalk-600">Asking GitHub which organisations you are in…</p>
      )}

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((organization) => (
            <OrganizationRow
              key={organization.login}
              organization={organization}
              checked={value.organizations.includes(organization.login)}
              disabled={busy}
              onToggle={toggle}
            />
          ))}
        </ul>
      )}

      {state === 'unavailable' && (
        <p className="text-[11px] leading-relaxed text-chalk-600">
          {error ??
            'GitHub did not answer. Connect it on the Integrations screen, then refresh this list.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={load}
          disabled={state === 'loading'}
          className="rounded border border-ink-700 px-4 py-1.5 text-[12px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === 'loading' ? 'Refreshing…' : 'Refresh from GitHub'}
        </button>
        {value.organizations.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onEdit({ ...value, organizations: [] });
            }}
            className="text-[11px] text-chalk-600 transition hover:text-chalk-100"
          >
            Count every organisation
          </button>
        )}
      </div>
    </div>
  );
}

/** One organisation, ticked or not. A label wrapping the box, so the whole row is the target. */
function OrganizationRow(props: {
  readonly organization: Organization;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: (login: string) => void;
}): React.ReactElement {
  const { organization, checked, disabled, onToggle } = props;
  return (
    <li>
      <label className="flex min-h-9 cursor-pointer items-start gap-2.5 text-[13px] text-chalk-300">
        <input
          type="checkbox"
          disabled={disabled}
          checked={checked}
          onChange={() => {
            onToggle(organization.login);
          }}
          className="mt-0.5 accent-chalk-100"
        />
        <span className="min-w-0">
          <span className="font-mono text-[12px] text-chalk-100">{organization.login}</span>
          {organization.description !== undefined && (
            <span className="ml-2 text-chalk-600">{organization.description}</span>
          )}
        </span>
      </label>
    </li>
  );
}

export default defineWebPlugin<CodeReviewSettings>({
  id: 'code-review',
  settings: { label: 'GitHub', Panel: CodeReviewPanel },
});
