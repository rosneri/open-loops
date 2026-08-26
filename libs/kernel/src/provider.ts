/**
 * Provider identity is shared-kernel vocabulary: loops, signals and integrations all need to
 * name the same twelve apps, and disagreeing about that name would be worse than the coupling.
 * Adding a provider is one entry here plus one adapter binding.
 */
export const SourceProvider = {
  Slack: 'SLACK',
  Gmail: 'GMAIL',
  GoogleCalendar: 'GOOGLE_CALENDAR',
  GoogleDrive: 'GOOGLE_DRIVE',
  GitHub: 'GITHUB',
  GitLab: 'GITLAB',
  Linear: 'LINEAR',
  Jira: 'JIRA',
  Notion: 'NOTION',
  Asana: 'ASANA',
  Discord: 'DISCORD',
  MicrosoftTeams: 'MICROSOFT_TEAMS',
  Outlook: 'OUTLOOK',
  Manual: 'MANUAL',
} as const;

export type SourceProvider = (typeof SourceProvider)[keyof typeof SourceProvider];

export const ALL_SOURCE_PROVIDERS: readonly SourceProvider[] = Object.values(SourceProvider);

export const isSourceProvider = (value: string): value is SourceProvider =>
  (ALL_SOURCE_PROVIDERS as readonly string[]).includes(value);
