import { defineWebPlugin, type SettingsPanelProps } from '@open-loops/plugin-ui';
import type { TemplateSettings } from '../settings.js';

/**
 * The panel is handed the saved value with unsaved edits over it, and hands back a whole new
 * value; the screen's one Save button writes it. `request` is the client's authenticated fetch,
 * for a panel that needs to read or call something of its own — this one does not.
 */
function TemplatePanel({ value, onEdit, busy }: SettingsPanelProps<TemplateSettings>): React.ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm text-chalk-300">
      <input
        type="checkbox"
        checked={value.enabled}
        disabled={busy}
        onChange={(event) => {
          onEdit({ ...value, enabled: event.target.checked });
        }}
        className="accent-chalk-100"
      />
      Count what is open on every tick
    </label>
  );
}

export default defineWebPlugin<TemplateSettings>({
  id: 'template',
  settings: { label: 'Template', Panel: TemplatePanel },
});
