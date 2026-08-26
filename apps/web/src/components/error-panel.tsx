export function ErrorPanel({ message }: { readonly message: string }): React.ReactElement {
  return (
    <div className="hairline rounded-lg border-signal-unconfirmed/40 bg-ink-900/60 px-5 py-4">
      <p className="font-mono text-[10px] tracking-[0.14em] text-signal-unconfirmed uppercase">
        Something failed
      </p>
      <p className="mt-1 font-mono text-[12px] break-all text-chalk-500">{message}</p>
    </div>
  );
}
