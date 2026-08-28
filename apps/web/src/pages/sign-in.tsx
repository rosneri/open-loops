import { useCallback, useState } from 'react';
import { api, UnauthorizedError, type SessionUser } from '../api.js';

interface SignInPageProps {
  readonly onSignedIn: (user: SessionUser) => void;
}

/**
 * The whole app is behind this, so it is the one screen that renders without any data. Accounts
 * are created with `bun run create-user`, which is why there is nothing to sign up for here.
 */
export function SignInPage({ onSignedIn }: SignInPageProps): React.ReactElement {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    (event: React.SyntheticEvent): void => {
      event.preventDefault();
      setBusy(true);
      setError(undefined);
      void api
        .login(username, password)
        .then(onSignedIn)
        .catch((cause: unknown) => {
          // The server refuses to say which half was wrong; the client must not guess either.
          setError(
            cause instanceof UnauthorizedError
              ? 'Wrong username or password.'
              : cause instanceof Error
                ? cause.message
                : String(cause),
          );
          setPassword('');
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [username, password, onSignedIn],
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="hairline w-full max-w-sm rounded-lg bg-ink-900/60 p-8">
        <h1 className="font-mono text-sm tracking-[0.2em] text-chalk-100">OPEN&nbsp;LOOPS</h1>
        <p className="mt-3 text-sm text-chalk-500">Sign in to see your day.</p>

        <label className="mt-8 block text-[11px] tracking-[0.14em] text-chalk-600 uppercase">
          Username
          <input
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
            className="mt-2 w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm tracking-normal text-chalk-100 normal-case outline-none focus:border-chalk-600"
          />
        </label>

        <label className="mt-4 block text-[11px] tracking-[0.14em] text-chalk-600 uppercase">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            className="mt-2 w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm tracking-normal text-chalk-100 normal-case outline-none focus:border-chalk-600"
          />
        </label>

        {error !== undefined && <p className="mt-4 text-[11px] text-signal-unconfirmed">{error}</p>}

        <button
          type="submit"
          disabled={busy || username.trim().length === 0 || password.length === 0}
          className="mt-6 w-full rounded border border-chalk-600 py-2 text-[12px] text-chalk-100 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-chalk-600"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
