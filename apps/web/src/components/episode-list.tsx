import type { EpisodeDto } from '@open-loops/contracts';

const STATUS_TONE: Record<string, string> = {
  READY: 'text-signal-done',
  GENERATING: 'text-signal-progress',
  REQUESTED: 'text-signal-progress',
  FAILED: 'text-signal-unconfirmed',
};

/**
 * A failed episode is listed with its reason rather than hidden. The usual reason is a missing
 * key or a provider quota, and neither is discoverable from an empty list.
 */
export function EpisodeList({
  episodes,
}: {
  readonly episodes: readonly EpisodeDto[];
}): React.ReactElement {
  return (
    <section>
      <h2 className="text-[11px] tracking-[0.14em] text-chalk-600 uppercase">Episodes</h2>

      {episodes.length === 0 ? (
        <p className="mt-3 text-[11px] text-chalk-600">
          Nothing recorded yet. The first one appears after the schedule fires, or right after
          you press Record today now.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {episodes.map((episode) => (
            <li key={episode.id} className="hairline rounded-lg bg-ink-900/60 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[12px] text-chalk-100">{episode.day}</span>
                <span
                  className={`font-mono text-[10px] tracking-[0.14em] uppercase ${
                    STATUS_TONE[episode.status] ?? 'text-chalk-600'
                  }`}
                >
                  {episode.status.toLowerCase()}
                </span>
              </div>

              {episode.audioUrl !== undefined && (
                <audio controls preload="none" src={episode.audioUrl} className="mt-3 w-full">
                  <track kind="captions" />
                </audio>
              )}

              {episode.error !== undefined && (
                <p className="mt-2 text-[11px] leading-relaxed text-signal-unconfirmed">
                  {episode.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
