/**
 * Provider identity is shared-kernel vocabulary: loops, signals and integrations all need to
 * name the same apps, and disagreeing about that name would be worse than the coupling.
 *
 * The *set* of names is not the kernel's business, though. It used to be a closed union here and
 * adding an app meant editing this file, a toolkit table and a table of fetch intents in a
 * connector — so the type is open and the registry of what actually exists is assembled from
 * whatever source plugins this deployment loaded. Every column that stores one of these is a
 * plain `String` in Postgres and always was, so opening it costs no migration.
 */
export type SourceProvider = string;

/**
 * The ids the first-party plugins register. Deliberately *not* exhaustive and not a validator:
 * it exists so code and tests can say `SourceProvider.Slack` instead of a bare string and get a
 * typo caught. A provider absent from this list is not an invalid provider.
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
  Sentry: 'SENTRY',
  Notion: 'NOTION',
  Asana: 'ASANA',
  WhatsApp: 'WHATSAPP',
  /** Meeting notes and action items, brokered from Wispr's hosted MCP server as a custom toolkit. */
  WisprFlow: 'WISPR_FLOW',
  /** Personal cashflow. Read-only, PAT-authenticated MCP — the local-agent push route. */
  RiseUp: 'RISEUP',
  Discord: 'DISCORD',
  MicrosoftTeams: 'MICROSOFT_TEAMS',
  Outlook: 'OUTLOOK',
} as const;
