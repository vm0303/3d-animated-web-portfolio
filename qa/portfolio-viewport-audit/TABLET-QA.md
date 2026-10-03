# Portfolio Tablet QA

This phase validates Portfolio tablet portrait and landscape geometry across the exhaustive tablet viewport registry.

## Portrait contract — LOCKED

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

Accepted candidate:

`qa/portfolio-viewport-audit/candidates/portfolio-tablet-portrait-v1.css`

Tablet portrait was manually accepted after exhaustive Chromium screenshot review. Do not retune it without a demonstrated regression.

## Landscape contract — CURRENT REVIEW

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

Current candidate:

`qa/portfolio-viewport-audit/candidates/portfolio-tablet-landscape-v1.css`

Manual review found the rest of tablet landscape acceptable except the longest project title at `1080x957`, `1080x958`, and `1080x959`. The title-size rule now uses both viewport height and viewport width so a tall but narrow tablet cannot grow the one-line title beyond its right-column width.

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

For visual QA, screenshots default to `all` so manual review can catch scale/spacing problems that numerical containment alone cannot detect.
