import type { ActivityLoopDto, ActivityRunDto } from '@open-loops/contracts';

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.ReactElement => (
  <section className="space-y-1.5">
    <h3 className="font-mono text-[10px] tracking-[0.14em] text-chalk-600 uppercase">{title}</h3>
    {children}
  </section>
);

const LoopLines = ({ loops }: { readonly loops: readonly ActivityLoopDto[] }): React.ReactElement => (
  <ul className="space-y-1">
    {loops.map((loop) => (
      <li key={loop.loopId} className="text-[12px] text-chalk-300">
        {loop.title}
        <span className="ml-2 font-mono text-[10px] text-chalk-600">
          {loop.provider} · {loop.externalId}
        </span>
      </li>
    ))}
  </ul>
);

/**
 * One run, opened up. Every section is omitted when it has nothing in it: a debugging screen
 * that lists eight empty headings makes the one thing that did happen harder to find.
 */
export function RunDetail({ run }: { readonly run: ActivityRunDto }): React.ReactElement {
  const { report, detail } = run;
  const fetched = Object.entries(detail.fetchedPerProvider);

  return (
    <div className="space-y-5">
      {report.failures.length > 0 && (
        <Section title="Failures">
          <ul className="space-y-1">
            {report.failures.map((failure, index) => (
              <li key={index} className="text-[12px] text-signal-unconfirmed">
                <span className="font-mono text-[10px]">{failure.source}</span> — {failure.error}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {fetched.length > 0 && (
        <Section title="Fetched">
          <ul className="space-y-1">
            {fetched.map(([provider, count]) => (
              <li key={provider} className="font-mono text-[11px] text-chalk-500">
                {provider}: {count}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {detail.pushProviders.length > 0 && (
        <Section title="Arrive by push">
          <p className="font-mono text-[11px] text-chalk-600">
            {detail.pushProviders.join(', ')} — nothing pulls these; they are not failures.
          </p>
        </Section>
      )}

      {detail.created.length > 0 && (
        <Section title={`Created (${String(detail.created.length)})`}>
          <LoopLines loops={detail.created} />
        </Section>
      )}

      {detail.restated.length > 0 && (
        <Section title={`Restated (${String(detail.restated.length)})`}>
          <LoopLines loops={detail.restated} />
        </Section>
      )}

      {detail.pruned.length > 0 && (
        <Section title={`Pruned (${String(detail.pruned.length)})`}>
          <p className="mb-1 text-[11px] text-chalk-600">
            From {detail.prunedProviders.join(', ')}. {detail.keptAsHistory} finished loops kept.
          </p>
          <LoopLines loops={detail.pruned} />
        </Section>
      )}

      {detail.skipped.length > 0 && (
        <Section title={`Skipped (${String(detail.skipped.length)})`}>
          <ul className="space-y-1">
            {detail.skipped.map((entry, index) => (
              <li key={index} className="text-[12px] text-chalk-500">
                <span className="font-mono text-[10px] text-chalk-600">
                  {entry.sourceExternalId}
                </span>{' '}
                — {entry.reason}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {detail.toolCalls.length > 0 && (
        <Section title={`Upstream calls (${String(detail.toolCalls.length)})`}>
          <ul className="space-y-1.5">
            {detail.toolCalls.map((call) => (
              <li key={call.logId} className="text-[12px]">
                <span className={call.ok ? 'text-chalk-300' : 'text-signal-unconfirmed'}>
                  {call.slug}
                </span>
                {call.intent !== undefined && (
                  <span className="ml-2 text-[11px] text-chalk-600">“{call.intent}”</span>
                )}
                <div className="font-mono text-[10px] text-chalk-600">
                  {call.logId}
                  {call.error !== undefined && ` · ${call.error}`}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
