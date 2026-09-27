# About viewport QA

This harness applies the responsive strategy proven on the Hero to the About section without reopening Hero styling.

## Design rule

Do not force every word into every viewport. The goal is a clean, readable, balanced composition. When a geometry genuinely cannot support all secondary copy at a professional size, intentional omission is acceptable. Shrinking text below the contract readability floor is not.

## What is deterministic in QA mode

The runner uses `about-qa=1`, `about-scene`, and `about-model` query parameters. In that mode only:

- the requested About scene/model is selected on first mount;
- carousel timers are disabled;
- OrbitControls interaction is disabled;
- auto-rotation is disabled;
- the section zoom timer is disabled;
- the real model, `visualScale`, Stage/Bounds framing, DOM, and production CSS remain in use.

Production behavior is unchanged when `about-qa=1` is absent.

## Model states

The contract covers 10 states: Laptop, Java, Spring, React, Cloud, Gears, Dumbbell, PS5, Bicycle, and Clapperboard.

## Viewport source

The About contract reuses the final Hero geometry universe from `qa/viewport-audit/hero-cross-browser-exhaustive-contract.json`. Measured and synthetic geometry remain distinct.

## Workflow

1. Run a quick baseline for the failing family.
2. Inspect report metrics and screenshots.
3. Create candidate CSS under `qa/about-viewport-audit/candidates/`.
4. Run the candidate against focused/neighboring geometry.
5. Expand to the full family.
6. Promote only the smallest generalized CSS change into `src/components/about/about.css`.
7. Later, run cross-browser certification once family geometry is green.

Candidate CSS is injected during evaluation of `About.jsx`, after the production `about.css` module has loaded but before React renders the About component. This preserves the Hero rule that candidate geometry must exist before the R3F canvas mounts.

## Commands

```powershell
npm run qa:about:quick
npm run qa:about:phone:portrait
npm run qa:about:phone:landscape
npm run qa:about:tablet:portrait
npm run qa:about:tablet:landscape
npm run qa:about:foldable
npm run qa:about:desktop:standard
npm run qa:about:desktop:wide
```

Run one model only:

```powershell
node qa/about-viewport-audit/run-about-composition-qa.cjs --family=phone-portrait --model=laptop --quick
```

Run a candidate before R3F mount:

```powershell
node qa/about-viewport-audit/run-about-composition-qa.cjs --family=phone-portrait --model=all --quick --override-css=qa/about-viewport-audit/candidates/about-phone-portrait-v1.css
```

Use `--strict` only when you want failures to return a non-zero exit code.

## Current tier state

### Phone portrait — promoted / frozen

Production source:

```text
src/components/about/about.css
```

Promoted candidate:

```text
qa/about-viewport-audit/candidates/about-phone-portrait-v17.css
```

Phone portrait now follows the same freeze rule used during Hero work: later family work must not change the validated phone-portrait composition unless a regression is demonstrated against the phone-portrait contract.

V17 includes the approved V16 composition plus the iOS Safari Liquid Glass About-section guard compensation. The compensation is gated by browser/viewport geometry and does not apply to Android/Chrome.

Production verification:

```powershell
npm run qa:about:closure:phone:portrait
npm run qa:about:phone:portrait:production:visual-smoke
```

## Family order after phone portrait

Continue in this exact order:

1. Phone landscape
2. Foldables
   - portrait
   - landscape
3. Tablets
   - portrait
   - landscape
4. Laptops / desktop geometry
5. Final About cross-browser / geometry closure

For every family, keep the Hero methodology:

1. establish the production baseline;
2. inspect metrics + screenshots;
3. create a family-scoped candidate;
4. run focused failing / boundary / neighboring geometry first;
5. run representative visual smoke;
6. expand to the full family;
7. perform cross-browser checks where appropriate;
8. promote the smallest generalized geometry rule;
9. freeze that family before moving to the next one.

Phone-landscape baseline commands:

```powershell
npm run qa:about:phone:landscape:quick
npm run qa:about:phone:landscape:visual-smoke
npm run qa:about:phone:landscape
```

### Phone landscape — active: short-height V1

The first landscape candidate follows the same family split used by Hero:

```text
short phone landscape:  height <= 355px
normal phone landscape: height 356px..500px
```

Current candidate:

```text
qa/about-viewport-audit/candidates/about-phone-landscape-short-v1.css
```

V1 is intentionally limited to the short-height tier. It top-aligns the
previously oversized text stack, gives copy more horizontal measure, and
scales typography/gaps from `svh`. It does not change portrait, normal
landscape, model normalization, per-model `visualScale`, camera framing,
or modal behavior.

Focused validation order:

```powershell
npm run qa:about:phone:landscape:short:v1
npm run qa:about:phone:landscape:short:v1:boundary
npm run qa:about:phone:landscape:short:v1:visual-smoke
npm run qa:about:phone:landscape:short:v1:full
```

Do not promote this candidate until the focused/boundary/visual/full short
landscape evidence is green and manually accepted.

### Phone landscape — active: short-height V2

V1 proved the compact typography/lane sizing removes the original clipping,
but visual review showed the left lane was pushed too far toward top alignment.
V2 restores vertical centering while keeping all copy left-aligned.

V2 also adds a phone-landscape modal containment rule. The modal image now
keeps its intrinsic aspect ratio instead of filling a forced 100% × 100%
image box, and modal QA now checks image containment + source/rendered aspect
ratio.

Portrait animation note:

- About now mirrors Hero.jsx's portrait mobile/tablet media-query state.
- Portrait phone/tablet uses fade-only entry variants for title, copy, and
  model lane.
- Landscape keeps the existing directional About motion.
- The fade is opacity-only and does not change geometry.

Validation order:

```powershell
npm run qa:about:phone:landscape:short:v2
npm run qa:about:phone:landscape:short:v2:boundary
npm run qa:about:phone:landscape:short:v2:visual-smoke
npm run qa:about:phone:landscape:short:v2:full
```

### Phone landscape — active: short-height V3

V2 composition is accepted: the left lane stays left-aligned and vertically
centered. V3 does not change that composition.

V3 fixes only the landscape laptop-screen modal. The image viewport is now a
definite positioned box, and the image fills that box with
`object-fit: contain`. This prevents the intrinsic-height image element from
extending below the short landscape viewport.

Boundary handling is explicit:

- `355px` belongs to the short-landscape tier and is the current V3 boundary.
- `356px` belongs to the next normal-landscape tier.
- The earlier combined 355/356 command failed at 356 because the short
  candidate intentionally stops at 355; that does not indicate a short-tier
  regression.
- A separate 356 baseline command is retained for the next phase.

Validation:

```powershell
npm run qa:about:phone:landscape:short:v3
npm run qa:about:phone:landscape:short:v3:boundary
npm run qa:about:phone:landscape:short:v3:visual-smoke
```

Next-tier baseline:

```powershell
npm run qa:about:phone:landscape:normal:356-baseline
```

### Phone landscape — short V3 promoted / frozen

Production source:

```text
src/components/about/about.css
```

Promoted candidate:

```text
qa/about-viewport-audit/candidates/about-phone-landscape-short-v3.css
```

Validated scope:

```text
width <= 1100px
height <= 355px
orientation: landscape
```

The short tier is now frozen. Normal-landscape work must not alter the
promoted <=355px composition.

Production verification:

```powershell
npm run qa:about:closure:phone:landscape:short
npm run qa:about:phone:landscape:short:production:visual-smoke
```

### Phone landscape — active: normal V1

Current candidate:

```text
qa/about-viewport-audit/candidates/about-phone-landscape-normal-v1.css
```

Scope:

```text
width <= 1100px
height 356px..500px
orientation: landscape
```

Normal V1 keeps the accepted landscape structure but relaxes the short-height
compression. It keeps the text left-aligned and vertically centered, preserves
all three paragraphs, uses a 60/40 text/model split, and carries the proven V3
modal containment pattern only inside the normal tier.

Validation order:

```powershell
npm run qa:about:phone:landscape:normal:v1
npm run qa:about:phone:landscape:normal:v1:boundary
npm run qa:about:phone:landscape:normal:v1:visual-smoke
npm run qa:about:phone:landscape:normal:v1:full
```

### Phone landscape — normal V1 promoted / frozen

Production source:

```text
src/components/about/about.css
```

Promoted candidate:

```text
qa/about-viewport-audit/candidates/about-phone-landscape-normal-v1.css
```

Validated scope:

```text
width <= 1100px
height 356px..500px
orientation: landscape
```

Normal V1 is accepted and frozen. Together with short V3, phone landscape is complete.

`SINGLE_WORD_LINE` has been removed from the About QA runner. Natural
single-word wrapping is accepted across About families. The stricter
`PUNCTUATION_ONLY_LINE` check remains.

Production verification:

```powershell
npm run qa:about:closure:phone:landscape:normal
npm run qa:about:phone:landscape:normal:production:visual-smoke
npm run qa:about:closure:phone:landscape
npm run qa:about:closure:phones
```

### Phones — complete / frozen

Phone portrait V17 and phone landscape short V3 + normal V1 are now promoted.
Later foldable/tablet/laptop work must not reopen phone geometry unless a
regression is demonstrated against the phone contracts.

### Next phase — parallel discovery, serial promotion

Foldables, tablets, and laptops may be baseline-tested in parallel to save
time, but candidate fixes and promotions remain family-scoped and frozen in
order. Cross-browser expansion should be performed after a family candidate is
geometrically stable rather than running every browser × model × geometry
combination during early iteration.

## Parallel discovery phase

Phones are frozen. The next discovery pass intentionally runs three family
workers in parallel:

1. Foldables
   - portrait first
   - landscape second
2. Tablets
   - portrait first
   - landscape second
3. Laptops
   - standard first
   - wide second

Each family worker is sequential internally, but the three family workers run
at the same time. This caps the initial workload at three concurrent
Playwright/R3F processes instead of launching every browser × model × geometry
combination at once.

Discovery uses:

- Chromium only;
- Laptop model only;
- one representative geometry per width;
- laptop modal sentinel;
- screenshots for every selected geometry;
- production About CSS only (no candidate override).

The three workers use separate Vite ports so they can run safely in parallel:

```text
foldables: 4181
tablets:   4182
laptops:   4183
```

The parallel orchestrator launches the About QA runner directly with the
current Node executable. It intentionally does not spawn nested `npm.cmd`
processes, avoiding the Windows/Node 22 `spawn EINVAL` failure mode.

Run everything:

```powershell
npm run qa:about:discover:parallel
```

Or run a family independently:

```powershell
npm run qa:about:discover:foldables
npm run qa:about:discover:tablets
npm run qa:about:discover:laptops
```

Individual discovery commands:

```powershell
npm run qa:about:discover:foldable:portrait
npm run qa:about:discover:foldable:landscape

npm run qa:about:discover:tablet:portrait
npm run qa:about:discover:tablet:landscape

npm run qa:about:discover:laptop:standard
npm run qa:about:discover:laptop:wide
```

Outputs are isolated under:

```text
qa-results/about/discovery/foldables/
qa-results/about/discovery/tablets/
qa-results/about/discovery/laptops/
```

The parallel orchestrator also writes:

```text
qa-results/about/parallel-discovery/parallel-discovery-summary.json
```

Discovery results are diagnostic. A FAIL in this stage does not stop the other
families. After reviewing the three baselines, candidate CSS work remains
family-scoped and promotion stays serial:

```text
foldables -> tablets -> laptops
```

Once one family is geometrically stable in Chromium, expand that family to
Firefox and WebKit before promotion/final closure. Do not run the full
browser × 10-model × exhaustive-geometry Cartesian matrix during early
candidate iteration.

## Post-phone candidate architecture

The manual discovery review established four responsive structures rather than
device-name-specific layouts:

1. Folded phone-like displays
   - keep the frozen phone geometry;
   - foldable QA inherits phone readability expectations when geometry is phone-like.
2. Medium portrait
   - unfolded foldable portrait + tablet portrait;
   - stacked model -> View screen -> About title -> three paragraphs.
3. Medium landscape
   - unfolded foldable landscape + tablet/compact-landscape geometry;
   - keep two columns, use a 55/45 text/model split and height-aware typography.
4. Desktop
   - standard desktop stays structurally unchanged;
   - post-1920 wide desktop gets a typography/measure scale tier first.

A shared non-phone modal candidate uses the source screenshot's 8:5 aspect
ratio instead of an unrelated fixed dialog height.

Candidate files:

```text
qa/about-viewport-audit/candidates/about-medium-portrait-v1.css
qa/about-viewport-audit/candidates/about-non-phone-modal-v1.css
qa/about-viewport-audit/candidates/about-medium-landscape-v1.css
qa/about-viewport-audit/candidates/about-wide-desktop-v1.css
```

The About runner accepts comma-separated `--override-css` values so shared
candidates can be composed without duplicating the non-phone modal rules.

### Stage 1 — medium portrait

```powershell
npm run qa:about:medium-portrait:v1
npm run qa:about:medium-portrait:v1:visual-smoke:foldable
npm run qa:about:medium-portrait:v1:visual-smoke:tablet
```

Only after visual acceptance:

```powershell
npm run qa:about:medium-portrait:v1:full
```

Folded outer-display semantics can be checked independently:

```powershell
npm run qa:about:foldable:outer:semantics
```

### Stage 2 — medium landscape

```powershell
npm run qa:about:medium-landscape:v1
npm run qa:about:medium-landscape:v1:visual-smoke
```

### Stage 3 — standard laptop modal sanity

Standard laptop layout is intentionally unchanged. Test the shared modal only:

```powershell
npm run qa:about:standard-laptop:modal:v1
```

### Stage 4 — wide desktop scale

```powershell
npm run qa:about:wide-desktop:v1
npm run qa:about:wide-desktop:v1:visual-smoke
```

Do not promote any of these candidates until its focused geometry and manual
visual review are accepted. Cross-browser Chromium/Firefox/WebKit expansion
comes after geometry stabilization.

### Medium portrait V2 — screenshot-audit corrections

The V1 ZIP was manually reviewed screenshot-by-screenshot, including both
good and bad screenshot folders.

Changes in V2 are intentionally narrow:

- Keep all folded landscape screenshots unchanged; they were visually clean.
- Keep good folded portrait widths 431–475px unchanged.
- Retain the V1 narrow/tall 390–429px portrait correction because production
  400x960 and 412x923 were visibly too small.
- For unfolded 501–699px portrait, only the tall >=800px subset is changed.
  The 626x890 screenshots had visibly small copy and excess unused vertical
  space. 540x720 and 645x715 remain unchanged.
- For tablet portrait, only >=900px wide and >=1320px tall is changed.
  985x1410 and 1023/1025x1366 looked miniature and left too much unused
  vertical space. 1024x1292 and 1032x1302 remain unchanged because their
  screenshots were already balanced.
- No new modal CSS change was made from this ZIP. Existing captured modal
  screenshots were fully visible and uncropped. The missing non-phone modal
  evidence was caused by a QA ReferenceError, now fixed by restoring the
  contract threshold binding inside evaluateModalMetrics.

Run the two demonstrated problem subsets first:

```powershell
npm run qa:about:medium-portrait:v2:problem-foldable
npm run qa:about:medium-portrait:v2:problem-tablet
```

Then rerun the representative visual matrix, including modal captures:

```powershell
npm run qa:about:medium-portrait:v2:visual-smoke:foldable
npm run qa:about:medium-portrait:v2:visual-smoke:tablet
```

Modal-only confirmation:

```powershell
npm run qa:about:medium-portrait:v2:modal-only
```

Only after those screenshots are approved should V2 be expanded to all model
states or promoted.

