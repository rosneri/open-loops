import { useCallback, useEffect, useState } from 'react';
import { api, UNAUTHORIZED_EVENT, type SessionUser } from './api.js';
import { TodayPage } from './pages/today.js';
import { IntegrationsPage } from './pages/integrations.js';
import { SignInPage } from './pages/sign-in.js';

const TABS = [
  { path: '/', label: 'Today' },
  { path: '/integrations', label: 'Integrations' },
] as const;

const normalise = (path: string): string => (path.startsWith('/integrations') ? '/integrations' : '/');

/** `undefined` while the cold-load check is in flight, `null` once we know there is no session. */
type Session = SessionUser | null | undefined;

/**
 * Two screens and no router dependency. When a third client or a deeper route appears this is
 * the moment to reach for one — not before. Nothing below renders until a session exists, so no
 * page has to think about being signed out.
 */
export function App(): React.ReactElement {
  const [path, setPath] = useState(() => normalise(window.location.pathname));
  const [session, setSession] = useState<Session>(undefined);

  useEffect(() => {
    void api
      .me()
      .then((user) => {
        setSession(user);
      })
      .catch(() => {
        setSession(null);
      });
  }, []);

  // Any request that comes back 401 — an expiry mid-session, or a cookie cleared in another tab.
  useEffect(() => {
    const onExpired = (): void => {
      setSession(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onExpired);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, onExpired);
    };
  }, []);

  const signOut = useCallback((): void => {
    // Optimistic: the cookie is httpOnly, so the server clearing it is the only thing that
    // matters, and the user should not be left staring at their data while that round trip runs.
    setSession(null);
    void api.logout().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onPop = (): void => {
      setPath(normalise(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const go = (next: string): void => {
    window.history.pushState({}, '', next);
    setPath(normalise(next));
  };

  if (session === undefined) {
    return <p className="px-8 py-10 text-sm text-chalk-500">Checking your session…</p>;
  }

  if (session === null) {
    return (
      <SignInPage
        onSignedIn={(user) => {
          setSession(user);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-800 px-8 py-5">
        <div className="mx-auto flex max-w-6xl items-baseline gap-10">
          <button
            type="button"
            onClick={() => {
              go('/');
            }}
            className="font-mono text-sm tracking-[0.2em] text-chalk-100"
          >
            OPEN&nbsp;LOOPS
          </button>
          <nav className="flex gap-6 text-sm">
            {TABS.map((tab) => (
              <button
                key={tab.path}
                type="button"
                onClick={() => {
                  go(tab.path);
                }}
                className={`transition ${
                  path === tab.path ? 'text-chalk-100' : 'text-chalk-500 hover:text-chalk-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-baseline gap-4">
            <span className="font-mono text-[11px] text-chalk-600">{session.username}</span>
            <button
              type="button"
              onClick={signOut}
              className="text-sm text-chalk-500 transition hover:text-chalk-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8 py-10">
        {path === '/integrations' ? <IntegrationsPage /> : <TodayPage />}
      </main>
    </div>
  );
}
