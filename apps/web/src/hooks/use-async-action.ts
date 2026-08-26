import { useCallback, useState } from 'react';

export interface AsyncAction {
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly run: (action: () => Promise<unknown>) => Promise<void>;
  readonly clearError: () => void;
}

/**
 * Every mutation in this client has the same shape: disable the buttons, run it, surface the
 * failure as text rather than a thrown promise, then reload. One hook instead of four copies.
 */
export function useAsyncAction(afterEach?: () => Promise<unknown>): AsyncAction {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<void> => {
      setBusy(true);
      setError(undefined);
      try {
        await action();
        if (afterEach !== undefined) await afterEach();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [afterEach],
  );

  const clearError = useCallback(() => {
    setError(undefined);
  }, []);

  return { busy, error, run, clearError };
}
