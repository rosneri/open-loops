import { useCallback, useEffect, useId, useState } from 'react';
import { api, UnauthorizedError, type SessionUser } from '../api.js';

interface SignInPageProps {
  readonly onSignedIn: (user: SessionUser) => void;
}

/**
 * Three things a person can do with an account they own: get into it, make one, or set a new
 * password on one they cannot get into. They are one form because they ask for the same fields —
 * which of them are shown is the only difference.
 */
type Mode = 'sign-in' | 'register' | 'reset';

/**
 * The whole app is behind this, so it is the one screen that renders without any data. It is a
 * login by default and grows a signup and a reset only where the deployment has an invite code
 * set — `bun run create-user` is still how the first account on a machine is made.
 *
 * The account is an email address rather than a name somebody invented: it is what every account
 * this app has ever had actually held, it is what a password manager expects to fill, and it is
 * the one identifier a person cannot mistype into somebody else's account without noticing.
 */
export function SignInPage({ onSignedIn }: SignInPageProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('sign-in');
  const canRegister = useRegistrationOffered();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const titleId = useId();
  const errorId = useId();

  const needsInvite = mode !== 'sign-in';

  const submit = useCallback(
    (event: React.SyntheticEvent): void => {
      event.preventDefault();
      const missing = firstMissing({ mode, email, password, inviteCode });
      if (missing !== undefined) {
        // Named rather than a disabled button: a control that cannot be pressed and does not say
        // why is the version of this a screen reader cannot get past.
        setError(missing);
        return;
      }

      setBusy(true);
      setError(undefined);
      void submission({ mode, email, password, inviteCode })
        .then(onSignedIn)
        .catch((cause: unknown) => {
          setError(explain(cause, mode));
          setPassword('');
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [mode, email, password, inviteCode, onSignedIn],
  );

  /** Switching what the form is for keeps the address and drops everything secret. */
  const switchTo = useCallback((next: Mode): void => {
    setMode(next);
    setError(undefined);
    setPassword('');
    setInviteCode('');
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8 sm:px-6">
      <form
        onSubmit={submit}
        aria-labelledby={titleId}
        // Our own messages, in our own words, in one place a screen reader is told about —
        // rather than a bubble per field that the browser writes and positions.
        noValidate
        className="hairline w-full max-w-sm rounded-lg bg-ink-900/60 p-6 sm:p-8"
      >
        <h1 id={titleId} className="font-mono text-sm tracking-[0.2em] text-chalk-100">
          OPEN&nbsp;LOOPS
        </h1>
        <p className="mt-3 text-sm text-chalk-500">{blurb(mode)}</p>

        <CredentialFields
          mode={mode}
          email={email}
          password={password}
          inviteCode={inviteCode}
          setEmail={setEmail}
          setPassword={setPassword}
          setInviteCode={setInviteCode}
          errorId={error === undefined ? undefined : errorId}
        />

        {/*
         * `alert` rather than a paragraph: the message replaces one that was read a moment ago,
         * and a failed sign-in that is only visible is a failed sign-in nobody was told about.
         */}
        {error !== undefined && (
          <p id={errorId} role="alert" className="mt-4 text-[11px] text-signal-unconfirmed">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="mt-6 min-h-11 w-full rounded border border-chalk-600 py-2 text-[12px] text-chalk-100 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-chalk-600"
        >
          {submitLabel(mode, busy)}
        </button>

        {canRegister && <ModeSwitch mode={mode} onSwitch={switchTo} />}

        {needsInvite && (
          <p className="mt-4 text-[11px] leading-relaxed text-chalk-600">
            {mode === 'reset'
              ? 'This deployment cannot send mail, so the invite code is what proves the account is yours. Resetting ends every session it has open.'
              : 'The invite code is the one whoever runs this deployment gave you.'}
          </p>
        )}
      </form>
    </div>
  );
}

/** The other things this form can be, offered only where the deployment has them at all. */
function ModeSwitch(props: {
  readonly mode: Mode;
  readonly onSwitch: (next: Mode) => void;
}): React.ReactElement {
  return (
    <div className="mt-4 flex flex-col gap-1">
      {ALTERNATIVES[props.mode].map((alternative) => (
        <button
          key={alternative.mode}
          type="button"
          onClick={() => {
            props.onSwitch(alternative.mode);
          }}
          className="min-h-10 w-full text-[11px] text-chalk-600 transition hover:text-chalk-100"
        >
          {alternative.label}
        </button>
      ))}
    </div>
  );
}

/** What each mode offers instead of itself, in the order the offers make sense. */
const ALTERNATIVES: Readonly<Record<Mode, readonly { mode: Mode; label: string }[]>> = {
  'sign-in': [
    { mode: 'register', label: 'I have an invite code' },
    { mode: 'reset', label: 'I forgot my password' },
  ],
  register: [{ mode: 'sign-in', label: 'I already have an account' }],
  reset: [{ mode: 'sign-in', label: 'Back to signing in' }],
};

interface CredentialFieldsProps {
  readonly mode: Mode;
  readonly email: string;
  readonly password: string;
  readonly inviteCode: string;
  readonly setEmail: (value: string) => void;
  readonly setPassword: (value: string) => void;
  readonly setInviteCode: (value: string) => void;
  /** The id of the message below, so every field points at the reason the form was refused. */
  readonly errorId: string | undefined;
}

/** The three inputs, together, because which of them are shown is one decision, not three. */
function CredentialFields({
  mode,
  email,
  password,
  inviteCode,
  setEmail,
  setPassword,
  setInviteCode,
  errorId,
}: CredentialFieldsProps): React.ReactElement {
  const emailId = useId();
  const passwordId = useId();
  const inviteId = useId();
  const hintId = useId();

  const newPassword = mode !== 'sign-in';

  return (
    <>
      <Field label="Email" htmlFor={emailId} className="mt-8">
        <input
          id={emailId}
          name="email"
          type="email"
          /*
           * `username` is the autocomplete token for whatever identifies the account, whether it
           * reads as a name or as an address — `email` is the token for a contact address on a
           * form that is not a login, and using it here is what stops password managers from
           * pairing the saved password with anything.
           */
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          aria-describedby={errorId}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          className={INPUT}
        />
      </Field>

      <Field
        label={mode === 'reset' ? 'New password' : 'Password'}
        htmlFor={passwordId}
        className="mt-4"
      >
        <input
          id={passwordId}
          name="password"
          type="password"
          // Telling the browser which one it is decides whether it offers to fill the saved
          // password or to save the new one.
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          required
          minLength={newPassword ? 12 : undefined}
          aria-describedby={describedBy(newPassword ? hintId : undefined, errorId)}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          className={INPUT}
        />
        {newPassword && (
          <span
            id={hintId}
            className="mt-2 block text-[11px] tracking-normal text-chalk-600 normal-case"
          >
            At least 12 characters.
          </span>
        )}
      </Field>

      {mode !== 'sign-in' && (
        <Field label="Invite code" htmlFor={inviteId} className="mt-4">
          <input
            id={inviteId}
            name="invite-code"
            type="password"
            // Deliberately not saved or filled: it is the deployment's shared secret, not this
            // account's, and a manager that remembers it would offer it as the password.
            autoComplete="off"
            required
            aria-describedby={errorId}
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

/** `aria-describedby` takes a list, and a field can have a hint, an error, both or neither. */
const describedBy = (...ids: readonly (string | undefined)[]): string | undefined => {
  const present = ids.filter((id): id is string => id !== undefined);
  return present.length === 0 ? undefined : present.join(' ');
};

const INPUT =
  'mt-2 w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-base sm:text-sm tracking-normal text-chalk-100 normal-case outline-none focus:border-chalk-600';

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly className: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="block text-[11px] tracking-[0.14em] text-chalk-600 uppercase"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Whether this deployment offers a signup at all — and with it the reset, which is proved by the
 * same invite code. A deployment without one has neither route, so showing either link would be
 * showing a link to a 403; a failed ask is a plain login, which is what this screen already is.
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

const blurb = (mode: Mode): string => {
  if (mode === 'register') return 'Create an account to start a day.';
  if (mode === 'reset') return 'Set a new password for your account.';
  return 'Sign in to see your day.';
};

const submitLabel = (mode: Mode, busy: boolean): string => {
  if (mode === 'register') return busy ? 'Creating account…' : 'Create account';
  if (mode === 'reset') return busy ? 'Setting password…' : 'Set new password';
  return busy ? 'Signing in…' : 'Sign in';
};

const submission = (input: {
  mode: Mode;
  email: string;
  password: string;
  inviteCode: string;
}): Promise<SessionUser> => {
  const { mode, email, password, inviteCode } = input;
  if (mode === 'register') return api.register({ email, password, inviteCode });
  if (mode === 'reset') return api.resetPassword({ email, password, inviteCode });
  return api.login(email, password);
};

/** The first field the form cannot do without, said as a sentence rather than as a red border. */
const firstMissing = (input: {
  mode: Mode;
  email: string;
  password: string;
  inviteCode: string;
}): string | undefined => {
  if (input.email.trim().length === 0) return 'Enter the email address for your account.';
  if (input.password.length === 0) {
    return input.mode === 'reset' ? 'Enter the new password.' : 'Enter your password.';
  }
  if (input.mode !== 'sign-in' && input.inviteCode.trim().length === 0) {
    return 'Enter the invite code for this deployment.';
  }
  return undefined;
};

/**
 * On the login half the server refuses to say which field was wrong, so the client must not
 * guess either. On the signup and reset halves it does say, and that answer is the one worth
 * showing: a taken address, a bad invite code and an address with no account need different
 * fixes.
 *
 * The shared fetch reports a failure as `POST /api/auth/register → 409: {json}`, which is the
 * right thing to see in a console and the wrong thing to read on a form. Nest puts the sentence
 * worth showing in `message`, so it is lifted out when it is there and the raw text stands in
 * when it is not.
 */
const explain = (cause: unknown, mode: Mode): string => {
  if (cause instanceof UnauthorizedError) return 'Wrong email or password.';
  const raw = cause instanceof Error ? cause.message : String(cause);
  if (mode === 'sign-in') return raw;
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
