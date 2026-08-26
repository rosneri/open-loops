import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const EXPORT_LINE = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/;

const unquote = (value: string): string => {
  const trimmed = value.trim().replace(/\s+#.*$/, '');
  return trimmed.replace(/^(['"])(.*)\1$/s, '$2');
};

/**
 * The Composio key lives in `~/.envrc` on this machine, which direnv exports into a shell but
 * not into a process started by a task runner. Reading it here means the same key works whether
 * the API is launched from a shell, from moon, or from an editor — and it is never copied into
 * the repository.
 */
export const loadEnvrc = (path = join(homedir(), '.envrc')): Record<string, string> => {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .reduce<Record<string, string>>((accumulated, line) => {
        const match = EXPORT_LINE.exec(line);
        if (match?.[1] !== undefined && match[2] !== undefined) {
          accumulated[match[1]] = unquote(match[2]);
        }
        return accumulated;
      }, {});
  } catch {
    return {};
  }
};

/** Process environment wins; `~/.envrc` only fills the gaps. */
export const withEnvrc = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const fromFile = loadEnvrc();
  const merged: NodeJS.ProcessEnv = { ...source };
  for (const [key, value] of Object.entries(fromFile)) {
    if (merged[key] === undefined || merged[key] === '') merged[key] = value;
  }
  return merged;
};
