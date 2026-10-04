# Portfolio Unfolded Foldable QA

This phase validates unfolded/inner foldable Portfolio geometry separately from folded/outer foldables.

For this Portfolio geometry matrix, unfolded/inner candidates are selected from the foldable exhaustive registry using a short-edge split:

- portrait: width >= 501 CSS px
- landscape: height >= 501 CSS px

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
- title remains on one line
- paragraph left aligned
- button centered
- image -> title -> text -> button order preserved
- no overlap/clipping
- no carousel arrows; use swipe/drag + dots

Candidate:

`qa/portfolio-viewport-audit/candidates/portfolio-foldable-unfolded-portrait-v1.css`

## Landscape contract

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Required:

- image centered vertically within the left half
- image remains within the left-half composition
- title remains one line in the right half
- title, paragraph, and button form one left-aligned right column
- paragraph left aligned
- title -> text -> button order preserved
- no overlap/clipping
- no carousel arrows; use swipe/drag + dots

Candidate:

`qa/portfolio-viewport-audit/candidates/portfolio-foldable-unfolded-landscape-v1.css`

## Exhaustive run

Both orientations:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-foldable-unfolded-exhaustive.cjs
```

Portrait only:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-foldable-unfolded-exhaustive.cjs --orientation=portrait
```

Landscape only:

```powershell
node qa/portfolio-viewport-audit/run-portfolio-foldable-unfolded-exhaustive.cjs --orientation=landscape
```

Default output:

`qa-results/portfolio/foldable-unfolded/chromium/`

Each orientation writes the normal Portfolio report plus `requirements-report.json` and `requirements-summary.json` with the unfolded visual contract applied.
