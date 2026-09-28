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

const outputRoot =
  path.join(
    root,
    'qa-results',
    'about',
    'final-production-closure'
  );

fs.mkdirSync(
  outputRoot,
  {
    recursive: true,
  }
);

const browsers = [
  'chromium',
  'firefox',
  'webkit',
];

const steps = [
  {
    name: 'phone-portrait',
    args: [
      '--family=phone-portrait',
    ],
  },
  {
    name: 'phone-landscape-short',
    args: [
      '--family=phone-landscape',
      '--max-height=355',
    ],
  },
  {
    name: 'phone-landscape-normal',
    args: [
      '--family=phone-landscape',
      '--min-height=356',
      '--max-height=500',
    ],
  },
  {
    name: 'foldable-outer-portrait',
    args: [
      '--family=foldable',
      '--orientation=portrait',
      '--max-width=500',
    ],
  },
  {
    name: 'foldable-unfolded-portrait',
    args: [
      '--family=foldable',
      '--orientation=portrait',
      '--min-width=501',
    ],
  },
  {
    name: 'foldable-outer-landscape',
    args: [
      '--family=foldable',
      '--orientation=landscape',
      '--max-height=500',
    ],
  },
  {
    name: 'foldable-unfolded-landscape',
    args: [
      '--family=foldable',
      '--orientation=landscape',
      '--min-height=501',
    ],
  },
  {
    name: 'tablet-portrait',
    args: [
      '--family=tablet-portrait',
    ],
  },
  {
    name: 'tablet-landscape',
    args: [
      '--family=tablet-landscape',
    ],
  },
  {
    name: 'desktop-standard',
    args: [
      '--family=desktop-standard',
    ],
  },
  {
    name: 'desktop-wide',
    args: [
      '--family=desktop-wide',
    ],
  },
];

const prefixLines =
  (
    prefix,
    chunk,
    stream
  ) => {
    for (
      const line of
      chunk
        .toString()
        .split(/\r?\n/)
    ) {
      if (!line) continue;
      stream.write(
        `[${prefix}] ${line}\n`
      );
    }
  };

const runAttempt =
  (
    browser,
    browserIndex,
    step,
    stepIndex,
    attempt
  ) =>
    new Promise(
      (resolve) => {
        const started =
          Date.now();

        const screenshots =
          browser === 'chromium'
            ? 'all'
            : 'bad';

        const port =
          4300 +
          browserIndex * 100 +
          stepIndex * 3 +
          attempt;

        const relativeOutput =
          path
            .relative(
              root,
              path.join(
                outputRoot,
                browser,
                attempt === 1
                  ? step.name
                  : `${step.name}-retry-${attempt}`
              )
            )
            .replace(
              /\\/g,
              '/'
            );

        const args = [
          runnerPath,
          '--model=laptop',
          '--one-per-width',
          '--modal',
          '--strict',
          '--webgl-probe',
          `--screenshots=${screenshots}`,
          `--browser=${browser}`,
          `--port=${port}`,
          `--output-dir=${relativeOutput}`,
          ...step.args,
        ];

        const prefix =
          `${browser}/${step.name}/attempt-${attempt}`;

        console.log(
          `[${prefix}] starting`
        );

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
              windowsHide: true,
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
            resolve({
              attempt,
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
            resolve({
              attempt,
              exitCode:
                code ?? 1,
              signal:
                signal ?? null,
              durationMs:
                Date.now() -
                started,
              outputDir:
                relativeOutput,
            });
          }
        );
      }
    );

const runStep =
  async (
    browser,
    browserIndex,
    step,
    stepIndex
  ) => {
    const attempts = [];

    const first =
      await runAttempt(
        browser,
        browserIndex,
        step,
        stepIndex,
        1
      );

    attempts.push(
      first
    );

    /*
     * Playwright WebKit can occasionally lose/withhold a WebGL context even
     * when the same production geometry is healthy. Retry a failed WebKit
     * step once in a completely fresh browser context/process. A real
     * geometry failure will fail again and still fail closure.
     */
    if (
      browser === 'webkit' &&
      first.exitCode !== 0
    ) {
      console.log(
        `[${browser}/${step.name}] retrying once in a fresh process`
      );

      attempts.push(
        await runAttempt(
          browser,
          browserIndex,
          step,
          stepIndex,
          2
        )
      );
    }

    const finalAttempt =
      attempts[
        attempts.length -
        1
      ];

    return {
      name:
        step.name,
      exitCode:
        finalAttempt.exitCode,
      attempts,
    };
  };

(async () => {
  const started =
    Date.now();

  const browserResults = [];

  console.log(
    'About final production closure: laptop sentinel only, production CSS only, no override CSS.'
  );

  for (
    let browserIndex = 0;
    browserIndex <
      browsers.length;
    browserIndex += 1
  ) {
    const browser =
      browsers[
        browserIndex
      ];

    console.log(
      `\n=== ${browser.toUpperCase()} ===`
    );

    const stepResults = [];

    for (
      let stepIndex = 0;
      stepIndex <
        steps.length;
      stepIndex += 1
    ) {
      const step =
        steps[
          stepIndex
        ];

      const result =
        await runStep(
          browser,
          browserIndex,
          step,
          stepIndex
        );

      stepResults.push(
        result
      );

      console.log(
        `[${browser}/${step.name}] final exit ${result.exitCode}`
      );
    }

    browserResults.push({
      browser,
      exitCode:
        stepResults.some(
          (step) =>
            step.exitCode !== 0
        )
          ? 1
          : 0,
      steps:
        stepResults,
    });
  }

  const summary = {
    artifactType:
      'about-final-production-closure-summary',
    generatedAt:
      new Date()
        .toISOString(),
    durationMs:
      Date.now() -
      started,
    policy: {
      productionCssOnly:
        true,
      overrideCss:
        false,
      model:
        'laptop',
      modalSentinel:
        true,
      oneRepresentativePerWidth:
        true,
      webglProbe:
        true,
      chromiumScreenshots:
        'all',
      firefoxScreenshots:
        'bad',
      webkitScreenshots:
        'bad',
      webkitRetryOnFailure:
        1,
    },
    browsers:
      browserResults,
  };

  const summaryPath =
    path.join(
      outputRoot,
      'production-closure-summary.json'
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
    '\nAbout final production closure complete.'
  );

  for (
    const result of
    browserResults
  ) {
    console.log(
      `- ${result.browser}: exit ${result.exitCode}`
    );
  }

  console.log(
    `Summary: ${path.relative(root,summaryPath)}`
  );

  if (
    browserResults.some(
      (result) =>
        result.exitCode !== 0
    )
  ) {
    process.exitCode =
      1;
  }
})();
