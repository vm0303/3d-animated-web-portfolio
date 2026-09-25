const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const node = process.execPath;

const steps = [
  {
    name: 'Phone portrait — exhaustive composition',
    script: 'qa/viewport-audit/run-hero-composition-qa.cjs',
    args: ['--orientation=portrait', '--strict', '--output-dir=qa-results/final-closure/phone-portrait'],
  },
  {
    name: 'Phone landscape — exhaustive composition',
    script: 'qa/viewport-audit/run-hero-composition-qa.cjs',
    args: ['--orientation=landscape', '--strict', '--output-dir=qa-results/final-closure/phone-landscape'],
  },
  {
    name: 'Tablet portrait — exhaustive composition',
    script: 'qa/viewport-audit/run-hero-tablet-composition-qa.cjs',
    args: ['--orientation=portrait', '--strict', '--output-dir=qa-results/final-closure/tablet-portrait'],
  },
  {
    name: 'Tablet landscape — exhaustive composition',
    script: 'qa/viewport-audit/run-hero-tablet-composition-qa.cjs',
    args: ['--orientation=landscape', '--strict', '--output-dir=qa-results/final-closure/tablet-landscape'],
  },
  {
    name: 'Foldables — exhaustive composition',
    script: 'qa/viewport-audit/run-hero-foldable-composition-qa.cjs',
    args: ['--strict', '--output-dir=qa-results/final-closure/foldables'],
  },
  {
    name: 'Every family geometry × Chromium/Firefox/WebKit — exhaustive cross-browser',
    script: 'qa/viewport-audit/run-hero-cross-browser-certification.cjs',
    args: [
      '--contract=qa/viewport-audit/hero-cross-browser-exhaustive-contract.json',
      '--output-dir=qa-results/final-closure/cross-browser-exhaustive',
      '--screenshots=bad',
      '--strict',
    ],
  },
  {
    name: 'Representative visual certification — all 34 current closure sentinels × 3 browsers',
    script: 'qa/viewport-audit/run-hero-cross-browser-certification.cjs',
    args: [
      '--output-dir=qa-results/final-closure/cross-browser-visual',
      '--strict',
    ],
  },
];

console.log('Hero FINAL closure');
console.log('==================');
console.log('Family composition cases: 162 phone portrait + 105 phone landscape + 50 tablet portrait + 52 tablet landscape + 37 foldable.');
console.log('Exhaustive cross-browser contract: 422 viewport/family cases × 3 engines = 1266 runs.');
console.log('Representative visual certification: 34 cases × 3 engines = 102 runs.');
console.log('');

for (let i = 0; i < steps.length; i += 1) {
  const step = steps[i];
  console.log(`\n[${i + 1}/${steps.length}] ${step.name}`);
  console.log('-'.repeat(Math.min(100, step.name.length + 8)));
  const result = spawnSync(node, [path.join(root, step.script), ...step.args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(`Unable to run ${step.name}:`, result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\nFINAL CLOSURE STOPPED: ${step.name} exited with code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

console.log('\n============================================================');
console.log('FINAL HERO CLOSURE PASSED: every configured family matrix and all three rendering engines are green.');
console.log('Results: qa-results/final-closure/');
console.log('============================================================');
