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

## Current phase

Responsive Portfolio geometry is now accepted for phones, folded foldables, unfolded foldables, and tablets.

Before laptop/desktop geometry and final Firefox/WebKit certification, Portfolio interaction/motion polish is being finalized:

- laptop/desktop carousel arrows become visible when Portfolio enters the viewport or when the user interacts with it
- pointer movement keeps arrows visible
- after 5 seconds of inactivity, arrows fade out even if the cursor remains resting over Portfolio
- phones, foldables, and tablets continue to hide carousel arrows and use swipe/drag plus dots
- touch-first phones/foldables/tablets use fade-only project entrance motion with no x/y movement
- fade-only order is image, then title after 2 seconds, paragraph after 4 seconds, and button after 6 seconds

## Still pending

- Laptop/desktop standard geometry
- Laptop/desktop wide geometry
- Final Chromium / Firefox / WebKit closure
