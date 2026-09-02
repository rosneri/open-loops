import type { Plugin } from '@open-loops/plugin-api';
import calendar from '@open-loops/plugin-calendar';
import chat from '@open-loops/plugin-chat';
import codeReview from '@open-loops/plugin-code-review';
import documents from '@open-loops/plugin-documents';
import issueTracker from '@open-loops/plugin-issue-tracker';
import localSources from '@open-loops/plugin-local-sources';
import mail from '@open-loops/plugin-mail';
import podcast from '@open-loops/plugin-podcast';

/**
 * What this deployment is made of. Plugins are imported rather than discovered: the set is known
 * at build time, the bundler can see through it, and a typo is a compile error instead of a
 * feature that silently did not load.
 *
 * `OPEN_LOOPS_PLUGINS` narrows it — a comma-separated list of ids, for running with a smaller
 * app than the repository ships. Widening it is a code change, on purpose.
 */
/** The order is the order the Integrations screen lists apps in, so it is not arbitrary. */
const ALL: readonly Plugin[] = [
  chat,
  mail,
  calendar,
  documents,
  codeReview,
  issueTracker,
  localSources,
  podcast,
];

export const enabledPlugins = (setting: string | undefined): readonly Plugin[] => {
  const wanted = (setting ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (wanted.length === 0) return ALL;

  const missing = wanted.filter((id) => !ALL.some((plugin) => plugin.id === id));
  if (missing.length > 0) {
    throw new Error(`OPEN_LOOPS_PLUGINS names plugins that do not exist: ${missing.join(', ')}.`);
  }
  return ALL.filter((plugin) => wanted.includes(plugin.id));
};
