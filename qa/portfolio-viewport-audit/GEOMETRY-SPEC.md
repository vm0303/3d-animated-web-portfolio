# Portfolio Responsive Geometry Source of Truth

This file is the authoritative visual/geometry contract for the Portfolio section.

If a future chat, QA run, candidate stylesheet, or refactor disagrees with this file, this file wins unless it is intentionally updated after manual visual approval.

## Scope

Validate the Portfolio across:

- phones: portrait and landscape
- foldable phones: folded/outer portrait and landscape
- unfolded foldables: portrait and landscape
- tablets: portrait and landscape
- laptops/desktops: standard and wide
- Chromium
- Firefox
- WebKit

Landscape QA must include both short-height and normal-height cases where applicable.

## Global Portfolio rules

- Embla is the carousel/navigation engine.
- Motion may animate project content, but settled geometry is judged after the Motion animation finishes.
- All five projects must be tested because title length, paragraph wrapping, and image geometry differ.
- No visible component may overlap, clip, or escape the Portfolio section.
- Size and spacing are part of the design contract. A layout is not accepted merely because it technically fits.
- When space becomes constrained, image/text/control sizing should reduce to a visually decent amount before spacing collapses or content clips.
- Dots remain usable as carousel position/navigation controls.
- Phones, foldables, unfolded foldables, and tablets use swipe/drag plus dots. Do not show carousel arrows on these device families.
- Carousel arrows are reserved for laptops/desktops. They remain hidden while idle and fade in/out around pointer/keyboard interaction.

---

## 1. Phones — Portrait

Required content order:

```text
IMAGE
  ↓
TITLE
  ↓
TEXT
  ↓
BUTTON
```

Requirements:

- image centered
- title centered and kept on one line
- paragraph left-aligned
- button centered
- image → title → text → button must have deliberate, visually balanced breathing room
- the three vertical gaps should read as one consistent stack rhythm
- title must remain readable without wrapping
- paragraph must remain readable without becoming cramped
- button must remain fully visible
- no carousel arrows

## 1. Phones — Landscape

Required composition:

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Requirements:

- two-column composition
- image on the left half of the viewport
- image vertically centered within the left side
- right-side content contains title, paragraph, then button
- title one line
- title left-aligned
- paragraph left-aligned
- button left-aligned
- right-side vertical spacing must remain deliberate and readable
- on short landscape heights, shrink image, typography, button, padding, and gaps as needed before allowing clipping/overlap
- no carousel arrows

---

## 2a. Foldable Phones — Folded/Outer Portrait

Use the same visual contract as phone portrait:

```text
IMAGE
  ↓
TITLE
  ↓
TEXT
  ↓
BUTTON
```

Requirements:

- image centered
- title one line
- paragraph left-aligned
- button centered
- even, intentional vertical spacing
- no clipping or overlap
- no carousel arrows

## 2a. Foldable Phones — Folded/Outer Landscape

Use the same visual contract as phone landscape:

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Requirements:

- image vertically centered on the left
- title one line and left-aligned on the right
- paragraph left-aligned
- button left-aligned
- short-height outer displays must scale components down rather than clip
- no carousel arrows

---

## 2b. Foldables — Unfolded Portrait

Use the same portrait stack:

```text
IMAGE
  ↓
TITLE
  ↓
TEXT
  ↓
BUTTON
```

Requirements:

- image centered
- title one line
- paragraph left-aligned
- button centered
- spacing should scale up appropriately compared with narrow outer displays
- do not leave phone-sized content floating in excessive empty space
- no carousel arrows

## 2b. Foldables — Unfolded Landscape

Use the same horizontal composition:

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Requirements:

- image centered vertically on the left
- title/text/button form the right column
- title one line and left-aligned
- paragraph left-aligned
- button left-aligned
- spacing and component scale should take advantage of the larger unfolded display
- no carousel arrows

---

## 3. Tablets — Portrait

Required content order:

```text
IMAGE
  ↓
TITLE
  ↓
TEXT
  ↓
BUTTON
```

Requirements:

- vertical composition
- image centered
- title, paragraph, and button fully visible
- paragraph remains left-aligned unless this source-of-truth file is intentionally revised
- spacing should breathe more than phone layouts where the available geometry permits it
- components must not remain unnecessarily phone-sized on large tablets
- no carousel arrows

## 3. Tablets — Landscape

Required composition:

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Requirements:

- two-column layout
- image vertically centered on the left
- title/text/button on the right
- title and paragraph left-aligned
- button left-aligned
- short landscape tablet heights must be tested separately from normal-height tablet landscapes
- no carousel arrows

---

## 4. Laptops / Desktops — Standard and Wide

Required composition:

```text
             TITLE
IMAGE        TEXT
             BUTTON
```

Requirements:

- image on the left
- title/text/button on the right
- components remain visually balanced and centered within the section
- title, paragraph, image, button, spacing, and controls scale appropriately as viewport width/height increases
- wide/high-resolution layouts must not leave normal-laptop-sized content stranded in large empty space
- content must not become excessively large either
- carousel arrows are allowed only here
- arrows are hidden while idle
- arrows fade in when the Portfolio receives relevant pointer/keyboard interaction
- arrows fade back out after interaction ends
- dots remain visible and synchronized with the selected slide

---

## QA acceptance principles

A Portfolio geometry is accepted only when both automated metrics and manual screenshot review agree that it matches this specification.

Manual visual review overrides a misleading PASS/FAIL when the metric does not represent the intended design. If that happens, fix the QA contract before tuning production CSS.

Candidate CSS remains isolated under `qa/portfolio-viewport-audit/candidates/` until the family is visually accepted. Accepted families should then be treated as locked and not retuned without a demonstrated regression.

Final closure requires Chromium, Firefox, and WebKit coverage before Portfolio is promoted back to `starter` and frozen.
