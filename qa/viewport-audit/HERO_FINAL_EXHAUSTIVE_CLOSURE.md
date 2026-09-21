# Hero final exhaustive closure

This closure promotes the approved narrow/tall landscape bridge for geometries such as 678x466 and validates the complete Hero geometry system.

## Production change

The promoted CSS is geometry-only:

- width: 667–700 CSS px
- height: 430–500 CSS px
- landscape
- aspect ratio <= 3/2

It does not use a device or model name and does not alter the existing <=666 folded-outer finish, the normal slab-phone landscape family, tablets, foldable inner displays, or desktops.

## Exhaustive geometry inventory

Generated directly from the current TestMU registry and current composition contracts:

- phone portrait: 162 cases
- phone landscape: 105 cases
- tablet portrait: 50 cases
- tablet landscape: 52 cases
- foldables: 37 cases
- desktop: 16 cases

The exhaustive cross-browser contract contains all 406 responsive family cases plus all 16 desktop cases = 422 case entries. Every entry is run in Chromium, Firefox, and WebKit: 1266 browser/viewport runs.

The family-specific composition runners are also run first because they contain stricter family-specific collision/spacing checks than the generic cross-browser closure contract.

## Run

Install dependencies and Playwright browsers if needed:

```powershell
npm install
npm run qa:hero:certify:install-browsers
```

Inspect the exhaustive matrix count:

```powershell
npm run qa:hero:certify:exhaustive:list
```

Run everything:

```powershell
npm run qa:hero:closure:all
```

The closure stops immediately on any REVIEW or FAIL because every step uses strict mode.

Results are kept separately under:

```text
qa-results/final-closure/
  phone-portrait/
  phone-landscape/
  tablet-portrait/
  tablet-landscape/
  foldables/
  cross-browser-exhaustive/
  cross-browser-visual/
```

`cross-browser-exhaustive` saves screenshots only for REVIEW/FAIL to avoid creating more than a thousand green PNGs. The final 34-case cross-browser visual certification saves the normal good screenshots for visual review, including Apple 2026 synthetic geometry probes.
