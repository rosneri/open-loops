import { useCallback, useEffect, useState } from 'react';
import { api, pluginRequest, UNAUTHORIZED_EVENT, type SessionUser } from './api.js';
import { TodayPage } from './pages/today.js';
import { IntegrationsPage } from './pages/integrations.js';
import { SettingsPage } from './pages/settings.js';
import { SignInPage } from './pages/sign-in.js';
import { webPlugins } from './plugins/enabled.js';

const CORE_TABS = [
  { path: '/', label: 'Today' },
  { path: '/integrations', label: 'Integrations' },
  { path: '/settings', label: 'Settings' },
] as const;

/** A plugin's pages get a tab each, after the product's own, in the order plugins are listed. */
const PLUGIN_PAGES = webPlugins.flatMap((plugin) => plugin.pages ?? []);

const TABS: readonly { readonly path: string; readonly label: string }[] = [
  ...CORE_TABS,
  ...PLUGIN_PAGES.map((page) => ({ path: page.path, label: page.label })),
];

/** The tab a location belongs to: the longest tab path it starts with, or Today. */
const normalise = (path: string): string =>
  TABS.filter((tab) => tab.path !== '/' && path.startsWith(tab.path))
    .map((tab) => tab.path)
    .sort((a, b) => b.length - a.length)[0] ?? '/';

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
    return <p className="px-5 py-8 text-sm text-chalk-500 sm:px-8 sm:py-10">Checking your session…</p>;
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
    <div className="min-h-[100dvh]">
      <AppHeader path={path} email={session.email} go={go} signOut={signOut} />

      <main className="mx-auto max-w-6xl px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 lg:px-8 lg:py-10">
        {path === '/integrations' && <IntegrationsPage />}
        {path === '/settings' && <SettingsPage />}
        {path === '/' && <TodayPage />}
        {PLUGIN_PAGES.filter((page) => page.path === path).map((page) => (
          <page.Page key={page.path} request={pluginRequest} />
        ))}
      </main>
    </div>
  );
}

function AppHeader(props: {
  readonly path: string;
  readonly email: string;
  readonly go: (next: string) => void;
  readonly signOut: () => void;
}): React.ReactElement {
  const { path, email, go, signOut } = props;
  return (
    <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/85 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/*
         * One row on a phone for identity, one for navigation. Above `sm` the two collapse into
         * the single baseline-aligned row the app has always had: the nav is small enough to sit
         * beside the wordmark there, and nowhere near small enough on a 375px screen.
         */}
        <div className="flex items-baseline gap-4 pt-4 sm:gap-10 sm:pt-0">
          <button
            type="button"
            onClick={() => {
              go('/');
            }}
            className="font-mono text-sm tracking-[0.2em] text-chalk-100"
          >
            OPEN&nbsp;LOOPS
          </button>

          <nav className="hidden gap-6 text-sm sm:flex sm:py-5">
            {TABS.map((tab) => (
              <TabButton key={tab.path} tab={tab} current={path} go={go} />
            ))}
          </nav>

          <div className="ml-auto flex items-baseline gap-4">
            <span className="hidden font-mono text-[11px] text-chalk-600 sm:inline">{email}</span>
            <button
              type="button"
              onClick={signOut}
              className="-mr-1 px-1 py-1 text-sm text-chalk-500 transition hover:text-chalk-300"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Scrolls sideways rather than wrapping to a second line as plugins add tabs. */}
        <nav className="rail -mx-4 flex gap-5 px-4 pt-3 pb-1 text-sm sm:hidden">
          {TABS.map((tab) => (
            <TabButton key={tab.path} tab={tab} current={path} go={go} />
          ))}
        </nav>
      </div>
    </header>
  );
}

function TabButton(props: {
  readonly tab: { readonly path: string; readonly label: string };
  readonly current: string;
  readonly go: (next: string) => void;
}): React.ReactElement {
  const { tab, current, go } = props;
  const active = current === tab.path;
  return (
    <button
      type="button"
      onClick={() => {
        go(tab.path);
      }}
      /*
       * The underline is what tells the two navs apart honestly: on the phone rail the active tab
       * can be scrolled half out of view, so colour alone is not enough of a marker.
       */
      className={`shrink-0 border-b-2 pb-2 whitespace-nowrap transition sm:border-0 sm:pb-0 ${
        active
          ? 'border-chalk-100 text-chalk-100'
          : 'border-transparent text-chalk-500 hover:text-chalk-300'
      }`}
    >
      {tab.label}
    </button>
  );
}
