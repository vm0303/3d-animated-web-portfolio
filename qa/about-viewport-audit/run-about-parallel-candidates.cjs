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
    'parallel-candidates'
  );

fs.mkdirSync(
  outputDir,
  {
    recursive: true,
  }
);

/*
 * Candidate visual review runner.
 *
 * The three family workers run in parallel:
 *
 *   foldables -> explicit outer + unfolded portrait/landscape
 *   tablets   -> portrait + landscape
 *   laptops   -> standard + wide
 *
 * Steps within each family remain serial so one worker never starts multiple
 * Vite/R3F instances on the same port.
 *
 * Folded outer displays intentionally use production CSS. They are included
 * here because their phone-like semantics must be explicitly verified rather
 * than assumed from the frozen phone families.
 */

const mediumPortraitStack = [
  'qa/about-viewport-audit/candidates/about-medium-portrait-v2.css',
  'qa/about-viewport-audit/candidates/about-non-phone-modal-v1.css',
  'qa/about-viewport-audit/candidates/about-medium-portrait-model-frame-v1.css',
].join(',');

const mediumLandscapeStack = [
  'qa/about-viewport-audit/candidates/about-medium-landscape-v1.css',
  'qa/about-viewport-audit/candidates/about-non-phone-modal-v1.css',
].join(',');

const standardLaptopStack =
  'qa/about-viewport-audit/candidates/about-non-phone-modal-v1.css';


const outerPortraitStack =
  'qa/about-viewport-audit/candidates/about-foldable-outer-portrait-v1.css';

const wideDesktopStack = [
  'qa/about-viewport-audit/candidates/about-wide-desktop-v1.css',
  'qa/about-viewport-audit/candidates/about-non-phone-modal-v1.css',
].join(',');

const commonArgs = [
  '--model=laptop',
  '--one-per-width',
  '--modal',
  '--screenshots=all',
  '--browser=chromium',
];

const jobs = [
  {
    name: 'foldables',
    port: 4191,
    steps: [
      {
        name: 'outer-portrait',
        args: [
          '--family=foldable',
          '--orientation=portrait',
          '--max-width=500',
          `--override-css=${outerPortraitStack}`,
          '--output-dir=qa-results/about/parallel-candidates/foldables/outer-portrait',
        ],
      },
      {
        name: 'unfolded-portrait',
        args: [
          '--family=foldable',
          '--orientation=portrait',
          '--min-width=501',
          `--override-css=${mediumPortraitStack}`,
          '--output-dir=qa-results/about/parallel-candidates/foldables/unfolded-portrait',
        ],
      },
      {
        name: 'outer-landscape',
        args: [
          '--family=foldable',
          '--orientation=landscape',
          '--max-height=500',
          '--output-dir=qa-results/about/parallel-candidates/foldables/outer-landscape',
        ],
      },
      {
        name: 'unfolded-landscape',
        args: [
          '--family=foldable',
          '--orientation=landscape',
          '--min-height=501',
          `--override-css=${mediumLandscapeStack}`,
          '--output-dir=qa-results/about/parallel-candidates/foldables/unfolded-landscape',
        ],
      },
    ],
  },
  {
    name: 'tablets',
    port: 4192,
    steps: [
      {
        name: 'portrait',
        args: [
          '--family=tablet-portrait',
          `--override-css=${mediumPortraitStack}`,
          '--output-dir=qa-results/about/parallel-candidates/tablets/portrait',
        ],
      },
      {
        name: 'landscape',
        args: [
          '--family=tablet-landscape',
          `--override-css=${mediumLandscapeStack}`,
          '--output-dir=qa-results/about/parallel-candidates/tablets/landscape',
        ],
      },
    ],
  },
  {
    name: 'laptops',
    port: 4193,
    steps: [
      {
        name: 'standard',
        args: [
          '--family=desktop-standard',
          `--override-css=${standardLaptopStack}`,
          '--output-dir=qa-results/about/parallel-candidates/laptops/standard',
        ],
      },
      {
        name: 'wide',
        args: [
          '--family=desktop-wide',
          `--override-css=${wideDesktopStack}`,
          '--output-dir=qa-results/about/parallel-candidates/laptops/wide',
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

        const args = [
          runnerPath,
          ...commonArgs,
          `--port=${job.port}`,
          ...step.args,
        ];

        const child =
          spawn(
            process.execPath,
            args,
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
              name: step.name,
              args: args.slice(1),
              exitCode: 1,
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
              name: step.name,
              args: args.slice(1),
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
    'About parallel candidate visual review: foldables + tablets + laptops.'
  );

  console.log(
    'Workers run in parallel; each worker runs its own responsive states serially.'
  );

  console.log(
    'Folded outer displays are explicitly rechecked with production CSS.'
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
      'about-parallel-candidates-summary',

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

    candidateStacks: {
      mediumPortrait:
        mediumPortraitStack,
      mediumLandscape:
        mediumLandscapeStack,
      outerPortrait:
        outerPortraitStack,
      standardLaptop:
        standardLaptopStack,
      wideDesktop:
        wideDesktopStack,
    },

    jobs:
      results,
  };

  const summaryPath =
    path.join(
      outputDir,
      'parallel-candidates-summary.json'
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
    '\nAbout parallel candidate visual review complete.'
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
