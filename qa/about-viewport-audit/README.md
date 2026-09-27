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

### Medium portrait model framing candidate

The V2 laptop screenshots show a consistently undersized 3D model across the
501–1100px portrait range. Apply
`candidates/about-medium-portrait-model-frame-v1.css` after V2. It sets the
Stage's fixed camera frame edge to `1.9` within that range; the production
default remains `2.55`, and per-model `visualScale` values stay unchanged.
The model frame is tied to the candidate because V2's stacked layout has not
yet been promoted to production.

The screenshot audit covered all 104 images in `Results(6).zip` (54 distinct
images; the rest were byte-identical repeats). Chromium visual sweeps captured
14 foldable and 12 tablet portrait geometries with the laptop and modal.
All ten model states were then checked at 645x715 and 985x1410. The 985x1410
QA failures are the existing 800px copy measure exceeding the 780px contract;
they are unrelated to the model frame. Continue the normal visual approval and
cross-browser workflow before promoting the candidate.


Run the laptop-sentinel visual sweep with the complete candidate stack:

```powershell
npm run qa:about:medium-portrait:model-frame:v1:visual-smoke:foldable
npm run qa:about:medium-portrait:model-frame:v1:visual-smoke:tablet
```

Or run both sequentially:

```powershell
npm run qa:about:medium-portrait:model-frame:v1:visual-smoke
```

These commands apply, in cascade order:

```text
about-medium-portrait-v2.css
about-non-phone-modal-v1.css
about-medium-portrait-model-frame-v1.css
```

They intentionally use the laptop as the geometry sentinel, capture all selected
screenshots, and do not alter the frozen phone production CSS. Review these
screenshots and reports before expanding the model-frame candidate to the
all-model certification pass.

### Parallel candidate visual review

Folded outer-display coverage is not considered accepted merely because the
phone families are frozen. The candidate review explicitly rechecks those
foldable states with production CSS and keeps them separate from unfolded
candidate geometry.

The tablet portrait reading-measure contract is also family-specific now:
tablet portrait may use up to 800px, while unfolded foldables keep the shared
780px medium-portrait limit.

Run the current candidate visual matrix with one command:

```powershell
npm run qa:about:candidates:parallel
```

The runner starts three workers in parallel:

```text
foldables
  outer portrait       production CSS
  unfolded portrait    medium portrait V2 + modal V1 + model frame V1
  outer landscape      production CSS
  unfolded landscape   medium landscape V1 + modal V1

tablets
  portrait             medium portrait V2 + modal V1 + model frame V1
  landscape            medium landscape V1 + modal V1

laptops
  standard             non-phone modal V1
  wide                 wide desktop V1 + non-phone modal V1
```

Each worker is sequential internally and has its own Vite port. Results are
written under:

```text
qa-results/about/parallel-candidates/
```

with a combined summary at:

```text
qa-results/about/parallel-candidates/parallel-candidates-summary.json
```

This is a visual/discovery pass using the laptop sentinel. Candidate promotion
remains family-scoped after the screenshots and reports are reviewed.

### Manual review checkpoint — parallel candidate pass

Manual screenshot review of the parallel candidate ZIP established the following
laptop-sentinel state:

- Foldable outer landscape: visually accepted. Keep production geometry unchanged.
- Foldable unfolded portrait: visually accepted. Freeze the current medium portrait
  V2 + modal V1 + model-frame V1 candidate stack; do not retune it.
- Foldable unfolded landscape: visually accepted. Freeze the current medium
  landscape V1 + modal V1 candidate stack; do not retune it.
- Tablet portrait: visually accepted. Freeze the current medium portrait V2 +
  modal V1 + model-frame V1 candidate stack; do not retune it.
- Tablet landscape: visually accepted. The six readability failures were caused
  by the QA contract switching to the 46px/16px normal tablet floor before the
  accepted compact-height typography tier ended. Tablet landscape <=768px high
  now uses a 42px title / 15px body floor. CSS is unchanged.
- Foldable outer portrait: not accepted yet. 400x960 and 412x923 need the
  narrow/tall readability correction.

The outer-portrait correction is isolated in:

```text
qa/about-viewport-audit/candidates/about-foldable-outer-portrait-v1.css
```

Run it with:

```powershell
npm run qa:about:foldable:outer:portrait:v1
```

Because 390–429px / >=880px portrait geometry can also occur on conventional
phones, this candidate must not be promoted blindly. Compare the frozen phone
overlap with and without the candidate:

```powershell
npm run qa:about:foldable:outer:portrait:v1:phone-overlap
```

Tablet landscape contract confirmation:

```powershell
npm run qa:about:tablet:landscape:accepted
```

The accepted candidate states above are frozen for further tuning, but still
require the planned all-model and cross-browser certification before production
promotion.

### Geometry lock checkpoint — laptop review and certification handoff

The laptop-sentinel screenshots from the parallel candidate run were manually
reviewed alongside their metrics.

- Standard desktop/laptop: accepted and geometry-locked. The layout remains
  balanced from 1024x768 through 1920x1080; only the shared non-phone modal
  candidate is layered over the existing production desktop geometry.
- Wide desktop: accepted and geometry-locked on V1. The composition is
  intentionally bounded/centered rather than stretched across ultra-wide
  canvases. At 3840px and wider the accepted tier holds the title at 80px,
  body copy at 21px, reading measure at 880px, and the About host at its
  existing ~1888px maximum width. Large outer gutters on 32:9/8K-width
  geometry are intentional; the content itself is not shrinking.

With those approvals, the responsive geometry design is complete once the
foldable-outer portrait phone-overlap regression is confirmed.

#### Phone-overlap regression sentinels

The About contract now includes explicit synthetic phone-portrait sentinels at:

```text
400x960
412x923
```

These are deliberately the same CSS geometries as the two corrected foldable
outer displays. They let the frozen phone layout be compared with and without
`about-foldable-outer-portrait-v1.css`.

The runner now throws an error when a requested selection contains zero
viewport cases. A zero-case QA command can no longer report a misleading
successful run.

Run:

```powershell
npm run qa:about:foldable:outer:portrait:v1:phone-overlap
```

Both baseline and candidate reports must show real viewport cases before the
outer-portrait correction is eligible for production promotion.

#### Locked-candidate all-model certification

After the phone-overlap comparison is visually accepted, run all ten About
model states in Chromium across one representative case per width for every
locked responsive structure:

```powershell
npm run qa:about:certify:locked:models:chromium
```

This uses the accepted candidate stacks and captures all screenshots under:

```text
qa-results/about/certification/locked-models-chromium/
```

#### Locked-candidate cross-browser certification

After the all-model Chromium screenshots are approved, run the laptop/WebGL
sentinel across Chromium, Firefox, and WebKit:

```powershell
npm run qa:about:certify:locked:cross-browser
```

or run each browser independently:

```powershell
npm run qa:about:certify:locked:browser:chromium
npm run qa:about:certify:locked:browser:firefox
npm run qa:about:certify:locked:browser:webkit
```

The browser passes use strict QA, the WebGL probe, one representative geometry
per width, and failure screenshots. WebKit automatically uses the runner's
pre-mount static-candidate path.

For a single sequential command covering the all-model Chromium pass followed
by all three browser sentinels:

```powershell
npm run qa:about:certify:locked:all
```

Do not promote these candidates into `src/components/about/about.css` until
the certification reports are green and the all-model screenshots have been
manually accepted. Production promotion and production closure remain separate
steps.

### Cross-browser checkpoint and Wide Desktop V2

The locked-candidate browser sentinel produced:

```text
Chromium  146 PASS / 0 REVIEW / 0 FAIL
Firefox   146 PASS / 0 REVIEW / 0 FAIL
WebKit    136 PASS / 0 REVIEW / 5 FAIL
```

All five WebKit failures belong to foldable outer portrait and are
`QA_EXECUTION_ERROR` timeouts waiting for `.about`. No About metrics were
collected in those cases. Every other WebKit responsive family passed,
including unfolded foldables, both tablet orientations, standard desktop, and
wide desktop. Treat outer portrait as an infrastructure rerun, not a geometry
failure.

The runner now preserves browser/runtime console errors and attempts an
execution-error screenshot so a repeated startup failure has actionable
evidence.

Retry only that state:

```powershell
npm run qa:about:certify:locked:webkit:outer-portrait:retry
```

#### Wide Desktop V2

Manual review overrules the numeric V1 PASS for wide desktop. V1 kept the
About host near 1888px, the model lane near 944px, and the modal at 1600px
while synthetic CSS viewports grew through 3440, 3840, 5120, and 7680px.

V2 keeps the accepted 1921–2560 geometry unchanged and starts a continuous
post-2560 scale tier. It expands only the About composition beyond the global
2000px container cap, keeps paragraph measure capped at 940px, allows
title/body to grow to 100px/25px, gives the model lane the larger host width,
and raises the modal ceiling while retaining the 8:5 and viewport-height
constraints.

Run the laptop + modal visual sweep across every wide viewport:

```powershell
npm run qa:about:wide-desktop:v2:visual-smoke
```

Do not run V2 all-model or V2 cross-browser certification until those
screenshots are manually accepted. Once accepted:

```powershell
npm run qa:about:wide-desktop:v2:all-models
npm run qa:about:wide-desktop:v2:cross-browser
```

All other responsive geometry remains frozen.

### Wide Desktop V2 — high-resolution/tall correction

The first V2 visual sweep passed numerically but manual screenshot review found
the 3840x2160-and-taller wide tier still visually undersized. 3840x1600 and
5120x1440 remain accepted and are intentionally not changed.

The high-resolution tier is gated by both:

```text
width  >= 3840px
height >= 2000px
```

It increases title/body presence, lowers the Stage frame edge to 1.8 so all 3D
models render larger without changing per-model visualScale, enlarges the View
screen control, and scales modal toolbar text/close icon while preserving the
already-approved large modal image/dialog geometry.

The QA contract now requires at least a 110px title and 28px body font in this
tier so a future cap regression cannot silently pass.

Focused visual review:

```powershell
npm run qa:about:wide-desktop:v2:highres-smoke
```

Full V2 visual regression, including the unchanged lower-wide viewports:

```powershell
npm run qa:about:wide-desktop:v2:visual-smoke
```

The WebKit outer-portrait retry completed 10/10 PASS. Together with manual
real-iPhone verification of the temporarily applied outer-portrait CSS, that
family is accepted; the temporary production edit was reverted and no
production About promotion has occurred yet.

