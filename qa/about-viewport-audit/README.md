# About viewport QA

This harness applies the responsive strategy proven on the Hero to the About section without reopening Hero styling.

## Design rule

Do not force every word into every viewport. The goal is a clean, readable, balanced composition. When a geometry genuinely cannot support all secondary copy at a professional size, intentional omission is acceptable. Shrinking text below the contract readability floor is not.

## What is deterministic in QA mode

The runner uses `about-qa=1`, `about-scene`, and `about-model` query parameters. In that mode only:

- the requested About scene/model is selected on first mount;
- carousel timers are disabled;
- OrbitControls interaction is disabled;
- auto-rotation is disabled;
- the section zoom timer is disabled;
- the real model, `visualScale`, Stage/Bounds framing, DOM, and production CSS remain in use.

Production behavior is unchanged when `about-qa=1` is absent.

## Model states

The contract covers 10 states: Laptop, Java, Spring, React, Cloud, Gears, Dumbbell, PS5, Bicycle, and Clapperboard.

## Viewport source

The About contract reuses the final Hero geometry universe from `qa/viewport-audit/hero-cross-browser-exhaustive-contract.json`. Measured and synthetic geometry remain distinct.

## Workflow

1. Run a quick baseline for the failing family.
2. Inspect report metrics and screenshots.
3. Create candidate CSS under `qa/about-viewport-audit/candidates/`.
4. Run the candidate against focused/neighboring geometry.
5. Expand to the full family.
6. Promote only the smallest generalized CSS change into `src/components/about/about.css`.
7. Later, run cross-browser certification once family geometry is green.

Candidate CSS is injected during evaluation of `About.jsx`, after the production `about.css` module has loaded but before React renders the About component. This preserves the Hero rule that candidate geometry must exist before the R3F canvas mounts.

## Commands

```powershell
npm run qa:about:quick
npm run qa:about:phone:portrait
npm run qa:about:phone:landscape
npm run qa:about:tablet:portrait
npm run qa:about:tablet:landscape
npm run qa:about:foldable
npm run qa:about:desktop:standard
npm run qa:about:desktop:wide
```

Run one model only:

```powershell
node qa/about-viewport-audit/run-about-composition-qa.cjs --family=phone-portrait --model=laptop --quick
```

Run a candidate before R3F mount:

```powershell
node qa/about-viewport-audit/run-about-composition-qa.cjs --family=phone-portrait --model=all --quick --override-css=qa/about-viewport-audit/candidates/about-phone-portrait-v1.css
```

Use `--strict` only when you want failures to return a non-zero exit code.
