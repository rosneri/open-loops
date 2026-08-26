import { useEffect, useState } from 'react';
import { TodayPage } from './pages/today.js';
import { IntegrationsPage } from './pages/integrations.js';

const TABS = [
  { path: '/', label: 'Today' },
  { path: '/integrations', label: 'Integrations' },
] as const;

const normalise = (path: string): string => (path.startsWith('/integrations') ? '/integrations' : '/');

/**
 * Two screens and no router dependency. When a third client or a deeper route appears this is
 * the moment to reach for one — not before.
 */
export function App(): React.ReactElement {
  const [path, setPath] = useState(() => normalise(window.location.pathname));

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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8 py-10">
        {path === '/integrations' ? <IntegrationsPage /> : <TodayPage />}
      </main>
    </div>
  );
}
