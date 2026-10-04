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

const argv =
  process.argv.slice(2);

const hasFlag =
  (name) =>
    argv.includes(
      `--${name}`
    );

const argValue =
  (name) => {
    const prefix =
      `--${name}=`;

    const hit =
      argv.find(
        (arg) =>
          arg.startsWith(
            prefix
          )
      );

    return hit
      ? hit.slice(
          prefix.length
        )
      : null;
  };

const browser =
  (
    argValue('browser') ||
    'chromium'
  )
    .toLowerCase();

const model =
  argValue('model') ||
  'all';

const screenshots =
  argValue('screenshots') ||
  'bad';

const outputRootArg =
  argValue('output-root') ||
  `qa-results/about/certification/${browser}-${model}`;

const outputRoot =
  path.resolve(
    root,
    outputRootArg
  );

const useWebglProbe =
  hasFlag(
    'webgl-probe'
  );

const allowedBrowsers =
  new Set([
    'chromium',
    'firefox',
    'webkit',
  ]);

if (
  !allowedBrowsers.has(
    browser
  )
) {
  throw new Error(
    `Unsupported browser: ${browser}`
  );
}

fs.mkdirSync(
  outputRoot,
  {
    recursive: true,
  }
);

const mediumPortraitStack = [
  'qa/about-viewport-audit/candidates/about-medium-portrait-v2.css',
  'qa/about-viewport-audit/candidates/about-non-phone-modal-v1.css',
  'qa/about-viewport-audit/candidates/about-medium-portrait-model-frame-v1.css',
].join(',');

const mediumLandscapeStack = [
  'qa/about-viewport-audit/candidates/about-medium-landscape-v1.css',
  'qa/about-viewport-audit/candidates/about-non-phone-modal-v1.css',
].join(',');

const outerPortraitStack =
  'qa/about-viewport-audit/candidates/about-foldable-outer-portrait-v1.css';

const standardDesktopStack =
  'qa/about-viewport-audit/candidates/about-non-phone-modal-v1.css';

const wideDesktopStack = [
  'qa/about-viewport-audit/candidates/about-wide-desktop-v1.css',
  'qa/about-viewport-audit/candidates/about-non-phone-modal-v1.css',
].join(',');

const browserPortOffset = {
  chromium: 0,
  firefox: 10,
  webkit: 20,
}[browser];

const commonArgs = [
  `--model=${model}`,
  '--one-per-width',
  '--modal',
  `--screenshots=${screenshots}`,
  `--browser=${browser}`,
  '--strict',
];

if (
  useWebglProbe
) {
  commonArgs.push(
    '--webgl-probe'
  );
}

const makeOutput =
  (...parts) =>
    path
      .relative(
        root,
        path.join(
          outputRoot,
          ...parts
        )
      )
      .replace(
        /\\/g,
        '/'
      );

const jobs = [
  {
    name:
      'foldables',
    port:
      4211 +
      browserPortOffset,
    steps: [
      {
        name:
          'outer-portrait',
        args: [
          '--family=foldable',
          '--orientation=portrait',
          '--max-width=500',
          `--override-css=${outerPortraitStack}`,
          `--output-dir=${makeOutput('foldables','outer-portrait')}`,
        ],
      },
      {
        name:
          'unfolded-portrait',
        args: [
          '--family=foldable',
          '--orientation=portrait',
          '--min-width=501',
          `--override-css=${mediumPortraitStack}`,
          `--output-dir=${makeOutput('foldables','unfolded-portrait')}`,
        ],
      },
      {
        name:
          'outer-landscape',
        args: [
          '--family=foldable',
          '--orientation=landscape',
          '--max-height=500',
          `--output-dir=${makeOutput('foldables','outer-landscape')}`,
        ],
      },
      {
        name:
          'unfolded-landscape',
        args: [
          '--family=foldable',
          '--orientation=landscape',
          '--min-height=501',
          `--override-css=${mediumLandscapeStack}`,
          `--output-dir=${makeOutput('foldables','unfolded-landscape')}`,
        ],
      },
    ],
  },
  {
    name:
      'tablets',
    port:
      4212 +
      browserPortOffset,
    steps: [
      {
        name:
          'portrait',
        args: [
          '--family=tablet-portrait',
          `--override-css=${mediumPortraitStack}`,
          `--output-dir=${makeOutput('tablets','portrait')}`,
        ],
      },
      {
        name:
          'landscape',
        args: [
          '--family=tablet-landscape',
          `--override-css=${mediumLandscapeStack}`,
          `--output-dir=${makeOutput('tablets','landscape')}`,
        ],
      },
    ],
  },
  {
    name:
      'desktops',
    port:
      4213 +
      browserPortOffset,
    steps: [
      {
        name:
          'standard',
        args: [
          '--family=desktop-standard',
          `--override-css=${standardDesktopStack}`,
          `--output-dir=${makeOutput('desktops','standard')}`,
        ],
      },
      {
        name:
          'wide',
        args: [
          '--family=desktop-wide',
          `--override-css=${wideDesktopStack}`,
          `--output-dir=${makeOutput('desktops','wide')}`,
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
          `${browser}/${job.name}/${step.name}`;

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
              cwd:
                root,
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
                args.slice(1),
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
                args.slice(1),
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
        `[${browser}/${job.name}/${step.name}] exit ${result.exitCode} (${Math.round(result.durationMs / 1000)}s)`
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
    `About locked-candidate certification: browser=${browser}, model=${model}, screenshots=${screenshots}.`
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
      'about-locked-candidate-certification-summary',
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
    browser,
    model,
    screenshots,
    webglProbe:
      useWebglProbe,
    candidateStacks: {
      outerPortrait:
        outerPortraitStack,
      mediumPortrait:
        mediumPortraitStack,
      mediumLandscape:
        mediumLandscapeStack,
      standardDesktop:
        standardDesktopStack,
      wideDesktop:
        wideDesktopStack,
    },
    jobs:
      results,
  };

  const summaryPath =
    path.join(
      outputRoot,
      'certification-summary.json'
    );

  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      summary,
      null,
      2
    ) +
      '\n',
    'utf8'
  );

  console.log(
    '\nAbout locked-candidate certification complete.'
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
    `Summary: ${path.relative(root,summaryPath)}`
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
