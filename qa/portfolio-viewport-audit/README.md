# Portfolio viewport QA

This harness starts the responsive-geometry phase for the finalized Embla + Motion Portfolio without reopening frozen Hero or About styling.

## What it tests

The runner reuses the final Hero/About exhaustive viewport universe and checks all five Portfolio projects:

- WeathAware
- NYC Info Tours
- 2048
- DocQuery
- React Arcade Puzzles

For each selected geometry it checks document overflow, Portfolio/carousel containment, image loading, image/text overlap, title/body/button containment, arrow and dot containment, active-dot correctness, typography floors, and the initial Portfolio entry Motion state.

The baseline interaction check also verifies:

- Arcade -> WeathAware forward loop
- WeathAware -> Arcade reverse loop
- keyboard ArrowRight navigation

Embla remains the navigation engine. Motion is measured separately so a transition-in-progress does not become a false geometry failure.

## Viewport families

The source of truth is:

`qa/viewport-audit/hero-cross-browser-exhaustive-contract.json`

Portfolio family order:

1. phone portrait
2. phone landscape short (<=355px)
3. phone landscape normal (>=356px)
4. foldable portrait
5. foldable landscape short (<=500px)
6. foldable landscape normal (>=501px)
7. tablet portrait
8. tablet landscape short (<=768px)
9. tablet landscape normal (>=769px)
10. desktop/laptop standard
11. desktop/laptop wide

Measured and synthetic geometry remain distinct. Boundary sentinels are added for the short/normal handoffs.

## First baseline

```powershell
git checkout css-viewport-test
git pull origin css-viewport-test
npm install
npm run qa:portfolio:baseline
```

The baseline is Chromium-only, uses representative minimum/middle/maximum geometry from every bucket, exercises all five projects, captures every Portfolio screenshot, and performs the loop/keyboard interaction smoke test.

Results:

```text
qa-results/portfolio/baseline/
  report.json
  summary.json
  screenshots/
```

## Family commands

```powershell
npm run qa:portfolio:phone:portrait
npm run qa:portfolio:phone:landscape:short
npm run qa:portfolio:phone:landscape:normal

npm run qa:portfolio:foldable:portrait
npm run qa:portfolio:foldable:landscape:short
npm run qa:portfolio:foldable:landscape:normal

npm run qa:portfolio:tablet:portrait
npm run qa:portfolio:tablet:landscape:short
npm run qa:portfolio:tablet:landscape:normal

npm run qa:portfolio:desktop:standard
npm run qa:portfolio:desktop:wide
```

Quick focused runs:

```powershell
npm run qa:portfolio:quick:phone:portrait
npm run qa:portfolio:quick:phone:landscape
```

## Candidate CSS

Do not edit production Portfolio CSS while tuning a family. Put candidate rules under:

`qa/portfolio-viewport-audit/candidates/`

and inject them with:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-composition-qa.cjs --family=phone-portrait --quick --project=all --screenshots=all --override-css=qa/portfolio-viewport-audit/candidates/portfolio-phone-portrait-v1.css --output-dir=qa-results/portfolio/candidates/phone-portrait-v1
```

The candidate cascade is evaluated after the production stylesheet. Once a family is numerically green and manually accepted, promote the smallest generalized geometry rule into `src/components/portfolio/portfolio.css` and freeze that family.

## Useful runner flags

```text
--family=all|phone-portrait|phone-landscape|foldable|tablet-portrait|tablet-landscape|desktop-standard|desktop-wide
--orientation=portrait|landscape
--height-tier=short|normal
--project=all|1|2|3|4|5
--browser=chromium|firefox|webkit
--quick
--one-per-width
--interaction-check
--screenshots=all|bad|none
--override-css=file.css[,file2.css]
--min-width=N --max-width=N --min-height=N --max-height=N
--output-dir=...
--strict
```

Cross-browser certification comes after the family geometry is accepted; this first commit intentionally establishes the baseline harness rather than prematurely freezing responsive CSS.
