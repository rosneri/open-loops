const TONE: Record<string, string> = {
  OPEN: 'border-signal-open/40 text-signal-open',
  IN_PROGRESS: 'border-signal-progress/40 text-signal-progress',
  DONE_UNCONFIRMED: 'border-signal-unconfirmed/50 text-signal-unconfirmed',
  DONE: 'border-signal-done/40 text-signal-done',
  SNOOZED: 'border-ink-600 text-chalk-600',
  DROPPED: 'border-ink-600 text-chalk-600',
};

const LABEL: Record<string, string> = {
  OPEN: 'open',
  IN_PROGRESS: 'in progress',
  DONE_UNCONFIRMED: 'done · not told',
  DONE: 'closed',
  SNOOZED: 'snoozed',
  DROPPED: 'dropped',
};

export function StatusPill({ status }: { status: string }): React.ReactElement {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase ${
        TONE[status] ?? 'border-ink-600 text-chalk-500'
      }`}
    >
      {LABEL[status] ?? status.toLowerCase()}
    </span>
  );
}
