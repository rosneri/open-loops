import type { WebPlugin } from '@open-loops/plugin-ui';
import codeReview from '@open-loops/plugin-code-review/ui';
import podcast from '@open-loops/plugin-podcast/ui';

/**
 * The client half of `apps/api/src/plugins/enabled.ts`. Listed rather than discovered, for the
 * same reason: the bundler sees through it, and a plugin that ships a panel the API does not
 * know about — or the other way round — is a mismatch a person notices, not one the screen
 * papers over. A plugin with no client contribution simply is not here.
 */
export const webPlugins: readonly WebPlugin[] = [codeReview, podcast];
