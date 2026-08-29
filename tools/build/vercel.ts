import { mkdir, rm, writeFile, cp } from 'node:fs/promises';
import { join } from 'node:path';

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

const run = async (command: readonly string[]): Promise<void> => {
  const result = Bun.spawnSync(command, { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(' ')} exited with ${String(result.exitCode)}`);
  }
};

const bundleApi = async (): Promise<void> => {
  await mkdir(FUNCTION, { recursive: true });
  await run([
    'bun',
    'build',
    'apps/api/src/vercel-entry.ts',
    '--target=node',
    '--format=esm',
    `--outfile=${join(FUNCTION, 'index.mjs')}`,
    ...OPTIONAL_NEST_DEPS.map((dependency) => `--external=${dependency}`),
  ]);

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
