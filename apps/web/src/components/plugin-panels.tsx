import type { PluginSettingsDto, UpdatePluginSettingsDto } from '@open-loops/contracts';
import type { WebPlugin } from '@open-loops/plugin-ui';
import { pluginRequest } from '../api.js';

interface PluginPanelsProps {
  /** Each plugin's saved value with the unsaved edits laid over it, in the server's order. */
  readonly plugins: readonly PluginSettingsDto[];
  readonly contributions: readonly WebPlugin[];
  readonly busy: boolean;
  readonly onEdit: (patch: UpdatePluginSettingsDto) => void;
}

/**
 * Whatever the installed plugins want a say in. The server lists which plugins have settings and
 * what each one's value is; the client matches them by id to the panels it shipped with. A
 * plugin with a value but no panel is simply not shown — it still runs on that value.
 */
export function PluginPanels({
  plugins,
  contributions,
  busy,
  onEdit,
}: PluginPanelsProps): React.ReactElement {
  return (
    <>
      {plugins.map((plugin) => {
        const settings = contributions.find((web) => web.id === plugin.id)?.settings;
        if (settings === undefined) return null;
        const { Panel } = settings;
        return (
          <section key={plugin.id} className="space-y-6">
            <h2 className="text-[11px] tracking-[0.14em] text-chalk-600 uppercase">
              {settings.label}
            </h2>
            <Panel
              value={plugin.value}
              onEdit={(value) => {
                onEdit({ id: plugin.id, value });
              }}
              busy={busy}
              request={pluginRequest}
            />
          </section>
        );
      })}
    </>
  );
}
