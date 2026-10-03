# Portfolio Tablet QA

This phase validates Portfolio tablet portrait and landscape geometry across the exhaustive tablet viewport registry.

## Portrait contract

```text
IMAGE
  ↓
TITLE
  ↓
TEXT
  ↓
BUTTON
```

Required:

- image centered
- vertical order preserved
- paragraph left aligned
- button centered
- no overlap or clipping
- no carousel arrows; tablets use swipe/drag + dots
- component sizing must scale up on larger tablet CSS viewports instead of remaining phone-sized

Candidate:

`qa/portfolio-viewport-audit/candidates/portfolio-tablet-portrait-v1.css`

## Landscape contract

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Required:

- two-column composition
- image centered vertically within the left half
- title/text/button form the right column
- right column left aligned
- paragraph left aligned
- no overlap or clipping
- no carousel arrows; tablets use swipe/drag + dots
- short-height and normal-height tablet landscapes are both included
- larger tablet CSS viewports must receive appropriately larger image, typography, button, and spacing

Candidate:

`qa/portfolio-viewport-audit/candidates/portfolio-tablet-landscape-v1.css`

## Exhaustive run

Both orientations:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-tablet-exhaustive.cjs
```

Portrait only:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-tablet-exhaustive.cjs --orientation=portrait
```

Landscape only:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-tablet-exhaustive.cjs --orientation=landscape
```

Default output:

`qa-results/portfolio/tablet/chromium/`

Each orientation writes the base Portfolio report plus `requirements-report.json` and `requirements-summary.json`.

For this first tablet pass, screenshots default to `all` so manual visual review can catch scale/spacing problems that numerical containment alone cannot detect.
