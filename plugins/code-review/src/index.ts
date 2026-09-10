import { Capability, definePlugin, type OwnerScope, type ProbeDefinition,
  type SourceDefinition,
} from '@open-loops/plugin-api';
import { CodeReviewController } from './http/code-review.controller.js';
import { focusPhrase, githubSetupStep } from './organizations.js';
import { settingsFragment, type CodeReviewSettings } from './settings.js';
import { ToolProbeRunner, asArray, includesAll, textOf } from '@open-loops/plugin-host';
import { probeText } from '@open-loops/loops';

/**
 * What "shipped" looks like in a code host. Three kinds, because they fail differently: a branch
 * with a PR on it is not a merge, and a merge is not the review somebody was asked for.
 *
 * The provider is whatever the model named, defaulting to GitHub — GitLab answers the same three
 * questions in the same words, and the broker's tool search is what resolves the difference.
 */
const provider = (draft: { provider?: string | undefined }): string => draft.provider ?? 'GITHUB';

const runnerFor =
  (question: ConstructorParameters<typeof ToolProbeRunner>[0]['question']) =>
  (scope: OwnerScope): ToolProbeRunner | undefined =>
    scope.tools === undefined
      ? undefined
      : new ToolProbeRunner({ tools: scope.tools, question, logger: scope.logger });

const pullRequestExists: ProbeDefinition = {
  kind: 'PULL_REQUEST_EXISTS',
  prompt:
    'a pull request exists. target is the repository ("acme/api"), contains is a title fragment, ref is a branch name.',
  provider,
  // `createdAfter` is the moment the promise was made: a PR that was already open when somebody
  // said "I'll put one up" is not evidence that they did.
  build: (draft) =>
    draft.target === undefined
      ? undefined
      : {
          repository: draft.target,
          createdAfter: draft.now,
          ...(draft.contains === undefined ? {} : { titleContains: draft.contains }),
          ...(draft.ref === undefined ? {} : { branchContains: draft.ref }),
        },
  runner: runnerFor({
    intent: (probe) =>
      `list open pull requests in the repository ${probeText(probe, 'repository') ?? ''}`,
    satisfied: (payload, probe) =>
      asArray(payload).some((item) =>
        includesAll(item, [probeText(probe, 'titleContains'), probeText(probe, 'branchContains')]),
      ),
  }),
};

const pullRequestMerged: ProbeDefinition = {
  kind: 'PULL_REQUEST_MERGED',
  prompt:
    'a pull request has been merged. target is the repository, ref is the PR number, contains is a title fragment.',
  provider,
  build: (draft) =>
    draft.target === undefined
      ? undefined
      : {
          repository: draft.target,
          ...(draft.ref === undefined ? {} : { pullRequestRef: draft.ref }),
          ...(draft.contains === undefined ? {} : { titleContains: draft.contains }),
        },
  runner: runnerFor({
    intent: (probe) => `list merged pull requests in ${probeText(probe, 'repository') ?? ''}`,
    satisfied: (payload) => asArray(payload).some((item) => textOf(item).includes('"merged_at":"')),
  }),
};

const reviewSubmitted: ProbeDefinition = {
  kind: 'REVIEW_SUBMITTED',
  prompt: 'a review has been left on a pull request. target is the repository, ref is the PR.',
  provider,
  build: (draft) =>
    draft.target === undefined || draft.ref === undefined
      ? undefined
      : { repository: draft.target, pullRequestRef: draft.ref },
  runner: runnerFor({
    intent: (probe) => `list reviews on pull request ${probeText(probe, 'pullRequestRef') ?? ''}`,
    satisfied: (payload) => asArray(payload).length > 0,
  }),
};

/**
 * The apps this plugin knows about: what upstream calls each one, and what to ask it for. These
 * were three tables in two other libraries; a source belongs with the code that understands it.
 */
const sources: readonly SourceDefinition[] = [
  { provider: 'GITHUB', label: 'GitHub', toolkit: 'github',
    intents: [
      'list my GitHub notifications and issues assigned to me',
      'search GitHub for open pull requests I authored or that await my review',
    ],
    /*
     * An account that belongs to one organisation for work and three for other people's side
     * projects gets a day made mostly of other people's side projects. Which ones count is a
     * setting, so it is read here per person and per sync rather than baked into the intents.
     */
    focus: async (scope) => {
      const settings = await scope.settings<CodeReviewSettings>();
      return focusPhrase(settings.organizations, settings.includePersonal);
    },
    setup: githubSetupStep(),
  },
  { provider: 'GITLAB', label: 'GitLab', toolkit: 'gitlab' },
];

export type { CodeReviewSettings } from './settings.js';
export { ORGANIZATIONS_ROUTE, type Organization, type OrganizationsDto } from './organizations.js';

export default definePlugin({
  id: 'code-review',
  version: '1.0.0',
  description: 'Pull requests and reviews.',
  capabilities: [
    Capability.RunProbes,
    Capability.Tools,
    Capability.WriteSignals,
    // The organisation filter: a setting to hold it, a route to fill the picker from GitHub.
    Capability.Settings,
    Capability.Http,
  ],
  setup: (context) => {
    context.settings.register(settingsFragment);
    context.http.register({ basePath: 'api/code-review', controllers: [CodeReviewController] });

    for (const source of sources) context.sources.register(source);
    for (const definition of [pullRequestExists, pullRequestMerged, reviewSubmitted]) {
      context.probes.register(definition);
    }
  },
});
