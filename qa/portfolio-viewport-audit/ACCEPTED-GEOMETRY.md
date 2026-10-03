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
- Laptop/desktop standard — LOCKED after full Chromium review across 7 configured standard desktop geometries and all 5 projects (35/35 geometry cases visually accepted and automated PASS).
- Laptop/desktop wide — LOCKED after full Chromium review across 9 configured wide/stress geometries and all 5 projects. The only two automated FAILs were WeathAware at `5120x2160` and `7680x2160`, both caused solely by the fixed-time entry-motion opacity probe (`ENTRY_MOTION_NOT_ACTIVE_AFTER_SCROLL`), not by geometry, clipping, overlap, typography, carousel controls, or interaction. Manual screenshot review accepted both layouts.

## Promoted responsive geometry

The accepted phone, folded/outer foldable, unfolded foldable, and tablet geometries are now promoted into `src/components/portfolio/portfolio.css` so runtime motion can be tested against the accepted responsive layouts without QA override CSS.

Production uses generalized viewport/input tiers rather than device-name media queries. Narrow phone and folded/outer geometries share their overlapping production tiers because those CSS viewports cannot be reliably distinguished by device family and their visual contracts are the same. Larger foldable/tablet rules are gated through the touch-first `pTouchLayout` state supplied by `Portfolio.jsx` so laptop/desktop layouts are not replaced just because a desktop window has tablet-like dimensions.

Laptop/desktop geometry remains the production desktop layout and is now manually accepted for both standard and wide families.

## Current interaction / motion behavior

- laptop/desktop carousel arrows fade in whenever the Portfolio section is scrolled into view
- pointer movement, pointer input, wheel input, focus, and keyboard interaction restart the arrow idle timer
- after 5 seconds of inactivity, the active class is removed and the arrows fade out over 900ms
- arrow fade-in and fade-out both use the same 900ms duration
- phones, folded foldables, unfolded foldables, and tablets hide carousel arrows and use swipe/drag plus dots
- touch-first phones/foldables/tablets use one Motion opacity-only fade for the full project composition with no x/y/scale movement
- image, title, paragraph, and button fade together as one group
- the touch composition fade lasts exactly 1.2 seconds
- laptop/desktop retains the directional Motion entrance

## Current phase

All Chromium Portfolio geometry families are now accepted and locked.

The remaining Portfolio phase is final cross-browser certification in Firefox and WebKit for accepted phone, tablet, and laptop/desktop geometries. Known fixed-time Motion probe mismatches at extreme stress widths should not reopen accepted geometry when screenshots and settled layout are correct.

## Still pending

- Final Firefox certification
- Final WebKit certification
- Portfolio production closure / freeze
