/**
 * Shown when the API is not the thing holding the clock. Saying this plainly is the difference
 * between a settings screen and a settings screen that lies: a serverless deployment has no
 * process that outlives a request, so a separate always-on scheduler reads these schedules and
 * calls back in. If it is not running, nothing here fires.
 */
export function PlatformCronNotice(): React.ReactElement {
  return (
    <div className="hairline rounded-lg bg-ink-900/60 p-4">
      <p className="text-[11px] leading-relaxed text-chalk-500">
        <span className="text-signal-progress">A separate scheduler honours these times.</span>{' '}
        This deployment has no process that outlives a request, so the always-on machine reads
        every account&rsquo;s schedule and calls back in when one is due. Any cron expression
        works, down to the minute — but only while that machine is running. The buttons below
        always work on demand.
      </p>
    </div>
  );
}
