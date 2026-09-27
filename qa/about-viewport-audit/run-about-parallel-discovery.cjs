const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root =
  path.resolve(
    __dirname,
    '..',
    '..'
  );

const runnerPath =
  path.join(
    root,
    'qa',
    'about-viewport-audit',
    'run-about-composition-qa.cjs'
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

/*
 * Do NOT spawn npm/npm.cmd here.
 *
 * On Windows/Node 22, directly spawning npm.cmd can throw spawn EINVAL
 * before the child process even starts. The discovery workers do not need
 * npm itself; they only need the About QA runner.
 *
 * Launch the runner with the current Node executable instead. This is
 * cross-platform, avoids shell quoting, and keeps the three-worker model:
 *
 *   foldables (portrait -> landscape)
 *   tablets   (portrait -> landscape)
 *   laptops   (standard -> wide)
 *
 * The three workers run in parallel. Steps within one worker remain serial.
 */

const jobs = [
  {
    name:
      'foldables',

    steps: [
      {
        name:
          'portrait',

        args: [
          '--family=foldable',
          '--orientation=portrait',
          '--model=laptop',
          '--one-per-width',
          '--modal',
          '--screenshots=all',
          '--browser=chromium',
          '--port=4181',
          '--output-dir=qa-results/about/discovery/foldables/portrait',
        ],
      },
      {
        name:
          'landscape',

        args: [
          '--family=foldable',
          '--orientation=landscape',
          '--model=laptop',
          '--one-per-width',
          '--modal',
          '--screenshots=all',
          '--browser=chromium',
          '--port=4181',
          '--output-dir=qa-results/about/discovery/foldables/landscape',
        ],
      },
    ],
  },

  {
    name:
      'tablets',

    steps: [
      {
        name:
          'portrait',

        args: [
          '--family=tablet-portrait',
          '--model=laptop',
          '--one-per-width',
          '--modal',
          '--screenshots=all',
          '--browser=chromium',
          '--port=4182',
          '--output-dir=qa-results/about/discovery/tablets/portrait',
        ],
      },
      {
        name:
          'landscape',

        args: [
          '--family=tablet-landscape',
          '--model=laptop',
          '--one-per-width',
          '--modal',
          '--screenshots=all',
          '--browser=chromium',
          '--port=4182',
          '--output-dir=qa-results/about/discovery/tablets/landscape',
        ],
      },
    ],
  },

  {
    name:
      'laptops',

    steps: [
      {
        name:
          'standard',

        args: [
          '--family=desktop-standard',
          '--model=laptop',
          '--one-per-width',
          '--modal',
          '--screenshots=all',
          '--browser=chromium',
          '--port=4183',
          '--output-dir=qa-results/about/discovery/laptops/standard',
        ],
      },
      {
        name:
          'wide',

        args: [
          '--family=desktop-wide',
          '--model=laptop',
          '--one-per-width',
          '--modal',
          '--screenshots=all',
          '--browser=chromium',
          '--port=4183',
          '--output-dir=qa-results/about/discovery/laptops/wide',
        ],
      },
    ],
  },
];


const prefixLines =
  (
    prefix,
    chunk,
    stream
  ) => {
    const chunkText =
      chunk.toString();

    for (
      const line of
      chunkText.split(
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


const runStep =
  (
    job,
    step
  ) =>
    new Promise(
      (resolve) => {
        const started =
          Date.now();

        const prefix =
          `${job.name}/${step.name}`;

        console.log(
          `[${prefix}] starting`
        );

        let settled =
          false;

        const finish =
          (result) => {
            if (settled) {
              return;
            }

            settled =
              true;

            resolve(
              result
            );
          };

        const child =
          spawn(
            process.execPath,
            [
              runnerPath,
              ...step.args,
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
              windowsHide:
                true,
            }
          );

        child.stdout.on(
          'data',
          (chunk) =>
            prefixLines(
              prefix,
              chunk,
              process.stdout
            )
        );

        child.stderr.on(
          'data',
          (chunk) =>
            prefixLines(
              prefix,
              chunk,
              process.stderr
            )
        );

        child.on(
          'error',
          (error) => {
            finish({
              name:
                step.name,
              args:
                step.args,
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
            finish({
              name:
                step.name,
              args:
                step.args,
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


const runJob =
  async (job) => {
    const started =
      Date.now();

    const steps = [];

    for (
      const step of
      job.steps
    ) {
      const result =
        await runStep(
          job,
          step
        );

      steps.push(
        result
      );

      console.log(
        `[${job.name}/${step.name}] exit ${result.exitCode} (${Math.round(result.durationMs / 1000)}s)`
      );
    }

    return {
      name:
        job.name,
      exitCode:
        steps.some(
          (step) =>
            step.exitCode !== 0
        )
          ? 1
          : 0,
      durationMs:
        Date.now() -
        started,
      steps,
    };
  };


(async () => {
  console.log(
    'About parallel discovery: foldables + tablets + laptops.'
  );

  console.log(
    'Each family runs its own sub-families sequentially; the three family workers run in parallel.'
  );

  console.log(
    `Node executable: ${process.execPath}`
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
      )
        .toISOString(),

    finishedAt:
      new Date()
        .toISOString(),

    durationMs:
      Date.now() -
      started,

    nodeExecutable:
      process.execPath,

    runnerPath:
      path.relative(
        root,
        runnerPath
      ),

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
