import type { ScheduleDto, UpdateScheduleDto } from '@open-loops/contracts';
import { CronField } from './cron-field.js';

interface ScheduleListProps {
  readonly schedules: readonly ScheduleDto[];
  readonly onEdit: (patch: UpdateScheduleDto) => void;
}

/**
 * Every kind of scheduled work, rendered from what the server said exists rather than from a
 * pair of fields named after the two things this app happened to do first. A plugin that
 * registers a third kind gets a cron box here without anybody editing a form.
 */
export function ScheduleList({ schedules, onEdit }: ScheduleListProps): React.ReactElement {
  return (
    <section className="space-y-8">
      <h2 className="text-[11px] tracking-[0.14em] text-chalk-600 uppercase">Schedules</h2>

      {schedules.map((schedule) => (
        <div key={schedule.kind} className="space-y-2">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-chalk-100">{schedule.label}</span>
            <label className="flex min-h-9 shrink-0 cursor-pointer items-center gap-2 text-[11px] text-chalk-500 sm:min-h-0">
              <input
                type="checkbox"
                checked={schedule.enabled}
                disabled={!schedule.available}
                onChange={(event) => {
                  onEdit({ kind: schedule.kind, enabled: event.target.checked });
                }}
                className="h-4 w-4 accent-chalk-100"
              />
              Enabled
            </label>
          </div>

          {!schedule.available && (
            <p className="text-[11px] text-signal-unconfirmed">
              Nothing on this deployment can run this yet, so it stays switched off.
            </p>
          )}

          <CronField
            label={`${schedule.label} schedule`}
            hint={schedule.description}
            value={schedule.cron}
            disabled={!schedule.enabled}
            onChange={(cron) => {
              onEdit({ kind: schedule.kind, cron });
            }}
          />
        </div>
      ))}
    </section>
  );
}
