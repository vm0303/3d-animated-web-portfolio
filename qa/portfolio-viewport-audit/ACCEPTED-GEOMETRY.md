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
- Tablet landscape short — LOCKED after exhaustive Chromium screenshot review. The user reviewed every screenshot and accepted the current tablet landscape geometry.
- Tablet landscape normal — LOCKED after exhaustive Chromium screenshot review. The prior `React Arcade Puzzles` clipping at `1080x957`, `1080x958`, and `1080x959` was resolved, and the user reviewed the complete rerun and accepted all screenshots.

## Promoted responsive geometry

The accepted phone, folded/outer foldable, unfolded foldable, and tablet geometries are now promoted into `src/components/portfolio/portfolio.css` so runtime motion can be tested against the accepted responsive layouts without QA override CSS.

Production uses generalized viewport/input tiers rather than device-name media queries. Narrow phone and folded/outer geometries share their overlapping production tiers because those CSS viewports cannot be reliably distinguished by device family and their visual contracts are the same. Larger foldable/tablet rules are gated through the touch-first `pTouchLayout` state supplied by `Portfolio.jsx` so laptop/desktop layouts are not replaced just because a desktop window has tablet-like dimensions.

## Current interaction / motion behavior

Before laptop/desktop geometry and final Firefox/WebKit certification, Portfolio interaction/motion polish is being finalized:

- laptop/desktop carousel arrows become visible when Portfolio enters the viewport or when the user interacts with it
- pointer movement, pointer input, wheel input, focus, and keyboard interaction restart the arrow idle timer
- after 5 seconds of inactivity, the active class is removed and CSS fades the arrows out over 900ms rather than removing them abruptly
- phones, folded foldables, unfolded foldables, and tablets hide carousel arrows and use swipe/drag plus dots
- touch-first phones/foldables/tablets use Motion opacity-only project entrance animation with no x/y/scale movement
- each touch fade lasts exactly 1.2 seconds
- sequence timing is image `0.0–1.2s`, title `1.2–2.4s`, paragraph `2.4–3.6s`, button `3.6–4.8s`
- laptop/desktop retains the existing directional Motion entrance pending its own geometry phase

## Still pending

- Laptop/desktop standard geometry
- Laptop/desktop wide geometry
- Final Chromium / Firefox / WebKit closure
