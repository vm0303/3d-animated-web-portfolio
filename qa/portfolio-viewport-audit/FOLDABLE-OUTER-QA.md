# Portfolio folded/outer foldable exhaustive QA

This phase tests **folded/outer foldable phones only**. Unfolded/inner-display foldables are a separate phase.

## Posture definition

Folded/outer geometry is identified by short edge <= 500 CSS px:

- portrait: width <= 500px
- landscape: height <= 500px

## Required portrait composition

```text
IMAGE
  ↓
TITLE
  ↓
TEXT
  ↓
BUTTON
```

Requirements:

- image centered
- title one line
- paragraph left-aligned
- button centered
- correct vertical order
- no clipping/overlap
- no carousel arrows
- swipe/drag + dots remain functional

## Required landscape composition

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Requirements:

- image centered vertically in the left half
- title one line in the right half
- title left-aligned
- paragraph left-aligned
- button left-aligned
- title/text/button share the right column
- no clipping/overlap
- no carousel arrows
- swipe/drag + dots remain functional

## Chromium exhaustive run

Pull the branch first:

```powershell
git pull origin css-viewport-test
```

Run both orientations:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-foldable-outer-exhaustive.cjs
```

Run portrait only:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-foldable-outer-exhaustive.cjs --orientation=portrait
```

Run landscape only:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-foldable-outer-exhaustive.cjs --orientation=landscape
```

## Cross-browser reruns after Chromium visual approval

```powershell
node qa/portfolio-viewport-audit/run-portfolio-foldable-outer-exhaustive.cjs --browser=firefox
node qa/portfolio-viewport-audit/run-portfolio-foldable-outer-exhaustive.cjs --browser=webkit
```

## Output

```text
qa-results/portfolio/foldable-outer/<browser>/
  portrait/
    report.json
    summary.json
    requirements-report.json
    requirements-summary.json
    screenshots/
  landscape/
    report.json
    summary.json
    requirements-report.json
    requirements-summary.json
    screenshots/
  foldable-outer-summary.json
```

The normal Portfolio runner still performs containment, readability, Motion, carousel, swipe and dot checks. The folded-foldable wrapper then applies the stricter visual contract for this phase: exact portrait/landscape composition, one-line titles, alignment, centering, and arrow suppression.

Portrait currently uses `portfolio-foldable-portrait-v2.css`.
Landscape currently uses `portfolio-foldable-outer-landscape-v1.css`, intentionally based on the phone-landscape V1 geometry that passed the exhaustive Chromium phone-landscape sweep.
