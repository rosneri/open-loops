/**
 * Shown when the API is running somewhere that cannot hold a cron job. Saying this plainly is
 * the difference between a settings screen and a settings screen that lies: a serverless
 * deployment has no long-lived process, so the platform's own daily cron is the real ceiling.
 */
export function PlatformCronNotice(): React.ReactElement {
  return (
    <div className="hairline rounded-lg bg-ink-900/60 p-4">
      <p className="text-[11px] leading-relaxed text-chalk-500">
        <span className="text-signal-progress">This deployment cannot hold a schedule.</span>{' '}
        Nothing here runs long enough to own a cron job, so the platform&rsquo;s own daily cron is
        what fires the sweep and the podcast. The expressions below are honoured exactly only by a
        long-running instance — the one on your own machine. Here they decide what that instance
        does, and the buttons still run either on demand.
      </p>
    </div>
  );
}
