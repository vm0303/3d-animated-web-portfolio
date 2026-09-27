const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root =
  path.resolve(
    __dirname,
    '..',
    '..'
  );

const outputDir =
  path.join(
    root,
    'qa-results',
    'about',
    'parallel-discovery'
  );

fs.mkdirSync(
  outputDir,
  {
    recursive: true,
  }
);

const npmBin =
  process.platform === 'win32'
    ? 'npm.cmd'
    : 'npm';

const jobs = [
  {
    name: 'foldables',
    script:
      'qa:about:discover:foldables',
  },
  {
    name: 'tablets',
    script:
      'qa:about:discover:tablets',
  },
  {
    name: 'laptops',
    script:
      'qa:about:discover:laptops',
  },
];

const prefixLines =
  (
    prefix,
    chunk,
    stream
  ) => {
    const text =
      chunk.toString();

    for (
      const line of
      text.split(
        /\r?\n/
      )
    ) {
      if (!line) {
        continue;
      }

      stream.write(
        `[${prefix}] ${line}\n`
      );
    }
  };

const runJob =
  (job) =>
    new Promise(
      (resolve) => {
        const started =
          Date.now();

        const child =
          spawn(
            npmBin,
            [
              'run',
              job.script,
            ],
            {
              cwd: root,
              env: {
                ...process.env,
              },
              stdio: [
                'ignore',
                'pipe',
                'pipe',
              ],
            }
          );

        child.stdout.on(
          'data',
          (chunk) =>
            prefixLines(
              job.name,
              chunk,
              process.stdout
            )
        );

        child.stderr.on(
          'data',
          (chunk) =>
            prefixLines(
              job.name,
              chunk,
              process.stderr
            )
        );

        child.on(
          'error',
          (error) => {
            resolve({
              name:
                job.name,
              script:
                job.script,
              exitCode:
                1,
              durationMs:
                Date.now() -
                started,
              error:
                error.message,
            });
          }
        );

        child.on(
          'exit',
          (
            code,
            signal
          ) => {
            resolve({
              name:
                job.name,
              script:
                job.script,
              exitCode:
                code ?? 1,
              signal:
                signal ?? null,
              durationMs:
                Date.now() -
                started,
            });
          }
        );
      }
    );

(async () => {
  console.log(
    'About parallel discovery: foldables + tablets + laptops.'
  );

  console.log(
    'Each family runs its own sub-families sequentially; the three family workers run in parallel.'
  );

  const started =
    Date.now();

  const results =
    await Promise.all(
      jobs.map(
        runJob
      )
    );

  const summary = {
    artifactType:
      'about-parallel-discovery-summary',
    startedAt:
      new Date(
        started
      ).toISOString(),
    finishedAt:
      new Date()
        .toISOString(),
    durationMs:
      Date.now() -
      started,
    jobs:
      results,
  };

  const summaryPath =
    path.join(
      outputDir,
      'parallel-discovery-summary.json'
    );

  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      summary,
      null,
      2
    ) + '\n',
    'utf8'
  );

  console.log(
    '\nAbout parallel discovery complete.'
  );

  for (
    const result of
    results
  ) {
    console.log(
      `- ${result.name}: exit ${result.exitCode} (${Math.round(result.durationMs / 1000)}s)`
    );
  }

  console.log(
    `Summary: ${path.relative(root, summaryPath)}`
  );

  if (
    results.some(
      (result) =>
        result.exitCode !== 0
    )
  ) {
    process.exitCode =
      1;
  }
})();
