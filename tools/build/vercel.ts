import { mkdir, rm, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import type { BunPlugin } from 'bun';

/**
 * Builds Vercel's Build Output directly instead of letting the Node builder trace the source
 * tree. Tracing cannot follow a Bun workspace whose packages export raw `.ts`, so the API is
 * bundled to one self-contained file here and handed over as a finished function.
 */
const ROOT = process.cwd();
const OUT = join(ROOT, '.vercel/output');
const FUNCTION = join(OUT, 'functions/api.func');

/** Nest lazily requires these only when a feature is used; none of them are used here. */
const OPTIONAL_NEST_DEPS = [
  'class-transformer',
  'class-validator',
  '@nestjs/microservices',
  '@nestjs/websockets',
  '@nestjs/platform-socket.io',
  'cache-manager',
  '@fastify/static',
  'pg-native',
];

/**
 * `msedge-tts` requires `buffer/index` rather than `buffer` — deliberately, so a browser bundler
 * picks up the polyfill. Bun leaves that subpath external for a Node target, which produced a
 * bundle that died on its first invocation with "Cannot find module 'buffer/index'": the build
 * was green and every request was a 500. The shim points it at Node's own Buffer instead.
 */
const nodeBuffer: BunPlugin = {
  name: 'buffer-subpath-to-node-builtin',
  setup(build) {
    build.onResolve({ filter: /^buffer\/index$/ }, () => ({
      path: join(ROOT, 'tools/build/node-buffer.cjs'),
    }));
  },
};

const run = async (command: readonly string[]): Promise<void> => {
  const result = Bun.spawnSync(command, { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(' ')} exited with ${String(result.exitCode)}`);
  }
};

const bundleApi = async (): Promise<void> => {
  await mkdir(FUNCTION, { recursive: true });

  // The API rather than the CLI, because the bundle needs a resolver plugin and `bun build`
  // has no flag for one.
  const built = await Bun.build({
    entrypoints: ['apps/api/src/vercel-entry.ts'],
    target: 'node',
    format: 'esm',
    external: [...OPTIONAL_NEST_DEPS],
    plugins: [nodeBuffer],
  });
  if (!built.success) {
    throw new AggregateError(built.logs, 'Bundling the API failed.');
  }
  const [artifact] = built.outputs;
  if (artifact === undefined) throw new Error('Bundling the API produced no output.');
  await writeFile(join(FUNCTION, 'index.mjs'), Buffer.from(await artifact.arrayBuffer()));

  // A require the runtime cannot satisfy is a function that dies on its first request, and the
  // build is the last place that can see it. Anything genuinely optional is listed above.
  assertResolvable(await Bun.file(join(FUNCTION, 'index.mjs')).text());

  await writeFile(
    join(FUNCTION, '.vc-config.json'),
    `${JSON.stringify(
      {
        runtime: 'nodejs22.x',
        handler: 'index.mjs',
        launcherType: 'Nodejs',
        shouldAddHelpers: false,
        maxDuration: 300,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(FUNCTION, 'package.json'), `${JSON.stringify({ type: 'module' })}\n`);
};

/**
 * Every bare `require` left in the bundle, minus Node's own modules and the optional Nest
 * dependencies we chose not to ship. The list should be empty; anything in it would surface in
 * production as FUNCTION_INVOCATION_FAILED on the first request rather than as a build error.
 */
const assertResolvable = (bundle: string): void => {
  const required = new Set(
    [...bundle.matchAll(/__require\("([^"]+)"\)/g)].map(([, specifier]) => specifier ?? ''),
  );
  const unresolved = [...required].filter(
    (specifier) =>
      !specifier.startsWith('node:') &&
      !isNodeBuiltin(specifier) &&
      !OPTIONAL_NEST_DEPS.some(
        (dependency) => specifier === dependency || specifier.startsWith(`${dependency}/`),
      ) &&
      // Nest reaches into these two by path when the feature is used; the packages are external.
      !specifier.startsWith('@nestjs/websockets/') &&
      !specifier.startsWith('@nestjs/microservices/'),
  );
  if (unresolved.length > 0) {
    throw new Error(
      `The bundle requires modules it does not contain: ${unresolved.join(', ')}. ` +
        'Bundle them, or add them to OPTIONAL_NEST_DEPS if nothing here uses them.',
    );
  }
};

/**
 * Node's own list, matched whole. `util/types` is a builtin and `buffer/index` is a package, so
 * anything that reasons about the part before the slash gets one of the two wrong.
 */
const isNodeBuiltin = (specifier: string): boolean => BUILTINS.has(specifier);

/** `module.builtinModules` without the `node:`-prefixed duplicates. */
const BUILTINS = new Set(
  (await import('node:module')).builtinModules.filter((name) => !name.startsWith('node:')),
);

const config = {
  version: 3,
  routes: [
    { handle: 'filesystem' },
    { src: '/api/(.*)', dest: '/api' },
    { src: '/(.*)', dest: '/index.html' },
  ],
  // Hobby allows one run per day per job, with up to an hour of imprecision. That is the
  // ceiling for a serverless deployment; the schedules in Settings are honoured exactly only
  // where a long-lived process holds the cron, which is what `schedulerKind` reports.
  crons: [
    { path: '/api/tick', schedule: '0 6 * * *' },
    { path: '/api/podcast/generate', schedule: '0 7 * * *' },
  ],
};

const main = async (): Promise<void> => {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  await run(['bun', 'run', '--cwd', 'libs/persistence', 'db:generate']);
  // Applies any migration the deploy is carrying. `deploy` never prompts and never resets, so
  // it is the only migrate command that belongs in a build.
  if ((process.env['DATABASE_URL'] ?? '').length > 0) {
    await run(['bun', 'run', '--cwd', 'libs/persistence', 'db:deploy']);
  }
  await run(['bun', 'run', '--cwd', 'apps/web', 'build']);
  await cp(join(ROOT, 'apps/web/dist'), join(OUT, 'static'), { recursive: true });

  await bundleApi();
  await writeFile(join(OUT, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);

  process.stdout.write('Build output ready at .vercel/output\n');
};

await main();
