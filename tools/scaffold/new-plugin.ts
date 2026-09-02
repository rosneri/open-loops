import { cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `bun run plugin:new <id> ["description"]` — copies `plugins/template` to `plugins/<id>`,
 * renames everything, and lists the new plugin everywhere the repository lists plugins: the
 * workspace, the root tsconfig, and both apps' enabled lists. Nothing is discovered at run
 * time, so a new plugin is a set of edits, and this makes them in one go.
 */
const ROOT = resolve(import.meta.dirname, '../..');

const [id, description = 'Describe what this plugin does.'] = process.argv.slice(2);
if (id === undefined || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('Usage: bun run plugin:new <kebab-case-id> ["one-line description"]');
  process.exit(1);
}
if (id === 'template' || existsSync(resolve(ROOT, 'plugins', id))) {
  console.error(`plugins/${id} already exists.`);
  process.exit(1);
}

const pascal = id
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join('');
const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
const title = id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

const edit = async (path: string, change: (text: string) => string): Promise<void> => {
  const file = resolve(ROOT, path);
  const before = await readFile(file, 'utf8');
  const after = change(before);
  if (after === before) throw new Error(`Nothing to change in ${path}; edit it by hand.`);
  await writeFile(file, after);
};

const insertAfter = (text: string, anchor: string, line: string): string => {
  if (!text.includes(anchor)) throw new Error(`Anchor not found: ${anchor}`);
  return text.replace(anchor, `${anchor}${line}`);
};

// 1. The directory.
await cp(resolve(ROOT, 'plugins/template'), resolve(ROOT, 'plugins', id), {
  recursive: true,
  filter: (source) => !source.includes('node_modules'),
});
for (const file of ['package.json', 'moon.yml', 'src/index.ts', 'src/settings.ts', 'src/index.test.ts', 'src/ui/index.tsx']) {
  await edit(`plugins/${id}/${file}`, (text) =>
    text
      .replaceAll('plugin-template', `plugin-${id}`)
      .replaceAll("id: 'template'", `id: '${id}'`)
      .replaceAll("name: 'template'", `name: '${id}'`)
      .replaceAll("toBe('template')", `toBe('${id}')`)
      .replaceAll('the template plugin', `the ${id} plugin`)
      .replaceAll('template counted the day', `${id} counted the day`)
      .replaceAll('TemplateSettings', `${pascal}Settings`)
      .replaceAll('templateSettingsSchema', `${camel}SettingsSchema`)
      .replaceAll('TemplatePanel', `${pascal}Panel`)
      .replaceAll("label: 'Template'", `label: '${title}'`)
      .replaceAll(/"description": "[^"]*"/g, `"description": "${description}"`)
      .replaceAll(/description: '[^']*'/g, `description: '${description}'`),
  );
}

// 2. The workspace and the compiler.
await edit('.moon/workspace.yml', (text) =>
  insertAfter(text, "  plugin-template: 'plugins/template'\n", `  plugin-${id}: 'plugins/${id}'\n`),
);
await edit('tsconfig.json', (text) =>
  insertAfter(
    text,
    '    {\n      "path": "./plugins/template"\n    },',
    `\n    {\n      "path": "./plugins/${id}"\n    },`,
  ),
);

// 3. The API: dependency, build order, enabled list.
await edit('apps/api/package.json', (text) =>
  text.replace(
    '"@open-loops/plugin-api": "workspace:*",',
    `"@open-loops/plugin-api": "workspace:*",\n    "@open-loops/plugin-${id}": "workspace:*",`,
  ),
);
await edit('apps/api/moon.yml', (text) => insertAfter(text, '  - plugin-api\n', `  - plugin-${id}\n`));
await edit('apps/api/src/plugins/enabled.ts', (text) =>
  insertAfter(
    text,
    "import type { Plugin } from '@open-loops/plugin-api';\n",
    `import ${camel} from '@open-loops/plugin-${id}';\n`,
  ).replace('\n];\n\nexport const enabledPlugins', `\n  ${camel},\n];\n\nexport const enabledPlugins`),
);

// 4. The client: dependency, build order, enabled list.
await edit('apps/web/package.json', (text) =>
  text.replace(
    '"@open-loops/plugin-ui": "workspace:*",',
    `"@open-loops/plugin-ui": "workspace:*",\n    "@open-loops/plugin-${id}": "workspace:*",`,
  ),
);
await edit('apps/web/moon.yml', (text) => insertAfter(text, '  - plugin-ui\n', `  - plugin-${id}\n`));
await edit('apps/web/src/plugins/enabled.ts', (text) =>
  insertAfter(
    text,
    "import type { WebPlugin } from '@open-loops/plugin-ui';\n",
    `import ${camel} from '@open-loops/plugin-${id}/ui';\n`,
  ).replace(/export const webPlugins: readonly WebPlugin\[\] = \[([^\]]*)\];/, (_match, list: string) =>
    `export const webPlugins: readonly WebPlugin[] = [${list.trim().length === 0 ? '' : `${list.trim().replace(/,$/, '')}, `}${camel}];`,
  ),
);

console.log(`plugins/${id} created and enabled in the API and the client.

Next:
  bun install
  moon run plugin-${id}:test
  moon run :typecheck :lint

Then open plugins/${id}/src/index.ts and replace the tick step with what this plugin is for.`);
