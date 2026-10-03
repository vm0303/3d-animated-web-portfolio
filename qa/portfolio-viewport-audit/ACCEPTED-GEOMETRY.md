# Portfolio Accepted Geometry State

This file records manual visual approvals so a future QA pass or chat does not reopen accepted families without a demonstrated regression.

## Locked / accepted

- Phone portrait — accepted after exhaustive screenshot review.
- Phone landscape — accepted after exhaustive screenshot review.
- Foldable folded/outer portrait — accepted after manual screenshot review.
- Foldable folded/outer landscape — accepted after manual screenshot review.
- Foldable unfolded/inner portrait — manually accepted. Some automated requirement failures were judged to be mismatches with the intended unfolded design; do not rerun or retune solely to satisfy those old requirement failures.
- Foldable unfolded/inner landscape — manually accepted. Some automated requirement failures were judged to be mismatches with the intended unfolded design; do not rerun or retune solely to satisfy those old requirement failures.

## Current phase

Tablet portrait and landscape are next.

Tablet portrait requires:

```text
IMAGE
  ↓
TITLE
  ↓
TEXT
  ↓
BUTTON
```

Tablet landscape requires:

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Large tablet CSS viewports must scale component sizes up appropriately rather than retaining phone-sized geometry.

## Still pending

- Tablet portrait
- Tablet landscape short
- Tablet landscape normal
- Laptop/desktop standard
- Laptop/desktop wide
- Final Chromium / Firefox / WebKit closure
