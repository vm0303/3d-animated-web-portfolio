# Portfolio Accepted Geometry State

This file records manual visual approvals so a future QA pass or chat does not reopen accepted families without a demonstrated regression.

## Locked / accepted

- Phone portrait — accepted after exhaustive screenshot review.
- Phone landscape — accepted after exhaustive screenshot review.
- Foldable folded/outer portrait — accepted after manual screenshot review.
- Foldable folded/outer landscape — accepted after manual screenshot review.
- Foldable unfolded/inner portrait — manually accepted. Some automated requirement failures were judged to be mismatches with the intended unfolded design; do not rerun or retune solely to satisfy those old requirement failures.
- Foldable unfolded/inner landscape — manually accepted. Some automated requirement failures were judged to be mismatches with the intended unfolded design; do not rerun or retune solely to satisfy those old requirement failures.
- Tablet portrait — LOCKED after exhaustive Chromium screenshot review. The user reviewed the full portrait set and accepted the current `portfolio-tablet-portrait-v1.css` geometry. Do not retune tablet portrait without a demonstrated regression.

## Current phase

Tablet landscape remains under review.

Required composition:

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Current manual review found only one visual regression family: `React Arcade Puzzles` at the tall/narrow synthetic tablet landscape boundary `1080x957`, `1080x958`, and `1080x959`, where the one-line title was clipped at the right edge.

The landscape candidate now constrains title growth by both viewport height and viewport width so tall-but-narrow tablet landscapes cannot grow the title beyond the available right-column width.

Large tablet CSS viewports must still scale component sizes up appropriately rather than retaining phone-sized geometry.

## Still pending

- Tablet landscape short
- Tablet landscape normal
- Laptop/desktop standard
- Laptop/desktop wide
- Final Chromium / Firefox / WebKit closure
