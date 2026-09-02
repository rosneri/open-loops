import { useCallback, useEffect, useState } from 'react';
import { api, UnauthorizedError, type SessionUser } from '../api.js';

interface SignInPageProps {
  readonly onSignedIn: (user: SessionUser) => void;
}

type Mode = 'sign-in' | 'register';

/**
 * The whole app is behind this, so it is the one screen that renders without any data. It is a
 * login by default and grows a signup half only where the deployment has an invite code set —
 * `bun run create-user` is still how the first account on a machine is made.
 */
export function SignInPage({ onSignedIn }: SignInPageProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('sign-in');
  const canRegister = useRegistrationOffered();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const registering = mode === 'register';

  const submit = useCallback(
    (event: React.SyntheticEvent): void => {
      event.preventDefault();
      setBusy(true);
      setError(undefined);
      void (
        registering
          ? api.register({ username, password, inviteCode })
          : api.login(username, password)
      )
        .then(onSignedIn)
        .catch((cause: unknown) => {
          setError(explain(cause, registering));
          setPassword('');
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [registering, username, password, inviteCode, onSignedIn],
  );

  const incomplete =
    username.trim().length === 0 ||
    password.length === 0 ||
    (registering && inviteCode.trim().length === 0);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="hairline w-full max-w-sm rounded-lg bg-ink-900/60 p-8">
        <h1 className="font-mono text-sm tracking-[0.2em] text-chalk-100">OPEN&nbsp;LOOPS</h1>
        <p className="mt-3 text-sm text-chalk-500">
          {registering ? 'Create an account to start a day.' : 'Sign in to see your day.'}
        </p>

        <CredentialFields
          registering={registering}
          username={username}
          password={password}
          inviteCode={inviteCode}
          setUsername={setUsername}
          setPassword={setPassword}
          setInviteCode={setInviteCode}
        />

        {error !== undefined && <p className="mt-4 text-[11px] text-signal-unconfirmed">{error}</p>}

        <button
          type="submit"
          disabled={busy || incomplete}
          className="mt-6 w-full rounded border border-chalk-600 py-2 text-[12px] text-chalk-100 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-chalk-600"
        >
          {submitLabel({ registering, busy })}
        </button>

        {canRegister && (
          <button
            type="button"
            onClick={() => {
              setMode(registering ? 'sign-in' : 'register');
              setError(undefined);
              setPassword('');
            }}
            className="mt-4 w-full text-[11px] text-chalk-600 transition hover:text-chalk-100"
          >
            {registering ? 'I already have an account' : 'I have an invite code'}
          </button>
        )}
      </form>
    </div>
  );
}

interface CredentialFieldsProps {
  readonly registering: boolean;
  readonly username: string;
  readonly password: string;
  readonly inviteCode: string;
  readonly setUsername: (value: string) => void;
  readonly setPassword: (value: string) => void;
  readonly setInviteCode: (value: string) => void;
}

/** The three inputs, together, because which of them are shown is one decision, not three. */
function CredentialFields({
  registering,
  username,
  password,
  inviteCode,
  setUsername,
  setPassword,
  setInviteCode,
}: CredentialFieldsProps): React.ReactElement {
  return (
    <>
      <Field label="Username" className="mt-8">
        <input
          type="text"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
          className={INPUT}
        />
      </Field>

      <Field label="Password" className="mt-4">
        <input
          type="password"
          // Telling the browser which one it is decides whether it offers to fill the saved
          // password or to save the new one.
          autoComplete={registering ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          className={INPUT}
        />
        {registering && (
          <span className="mt-2 block text-[11px] tracking-normal text-chalk-600 normal-case">
            At least 12 characters.
          </span>
        )}
      </Field>

      {registering && (
        <Field label="Invite code" className="mt-4">
          <input
            type="password"
            autoComplete="off"
            value={inviteCode}
            onChange={(event) => {
              setInviteCode(event.target.value);
            }}
            className={INPUT}
          />
        </Field>
      )}
    </>
  );
}

const INPUT =
  'mt-2 w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-sm tracking-normal text-chalk-100 normal-case outline-none focus:border-chalk-600';

function Field({
  label,
  className,
  children,
}: {
  readonly label: string;
  readonly className: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className={`${className} block text-[11px] tracking-[0.14em] text-chalk-600 uppercase`}>
      {label}
      {children}
    </label>
  );
}

/**
 * Whether this deployment offers a signup at all. A deployment without an invite code has no
 * registration route, so showing the link would be showing a link to a 403; a failed ask is a
 * plain login, which is what this screen already is.
 */
const useRegistrationOffered = (): boolean => {
  const [offered, setOffered] = useState(false);
  useEffect(() => {
    void api
      .registrationEnabled()
      .then(setOffered)
      .catch(() => {
        setOffered(false);
      });
  }, []);
  return offered;
};

const submitLabel = (state: { registering: boolean; busy: boolean }): string => {
  if (state.registering) return state.busy ? 'Creating account…' : 'Create account';
  return state.busy ? 'Signing in…' : 'Sign in';
};

/**
 * On the login half the server refuses to say which field was wrong, so the client must not
 * guess either. On the signup half it does say, and that answer is the one worth showing: a
 * taken username and a bad invite code need different fixes.
 *
 * The shared fetch reports a failure as `POST /api/auth/register → 409: {json}`, which is the
 * right thing to see in a console and the wrong thing to read on a form. Nest puts the sentence
 * worth showing in `message`, so it is lifted out when it is there and the raw text stands in
 * when it is not.
 */
const explain = (cause: unknown, registering: boolean): string => {
  if (cause instanceof UnauthorizedError) return 'Wrong username or password.';
  const raw = cause instanceof Error ? cause.message : String(cause);
  if (!registering) return raw;
  try {
    const parsed: unknown = JSON.parse(raw.slice(raw.indexOf('{')));
    const message = (parsed as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  } catch {
    /* not JSON, or truncated by the 300-character cap; the raw text is still true */
  }
  return raw;
};
