# Contact Responsive Geometry Source of Truth

This file preserves the intended responsive geometry contract for the Contact section so the work can continue consistently across chats.

The Contact implementation is not finalized yet. This contract starts from the chosen Lama Dev Contact structure: a contact form plus the animated `ContactSvg`, adapted to the same geometry-first responsive standards used for Hero, About, and Portfolio.

Once the final Contact implementation is visually approved, update this file with any intentional design changes and treat the revised file as authoritative.

## Expected Contact components

The Contact section is expected to contain:

1. contact title
2. name field
3. email field
4. message field
5. send button
6. success/error feedback when applicable
7. animated Contact SVG / illustration

The form and SVG are separate visual regions. Motion is allowed, but settled geometry is evaluated after entry animations finish.

## Scope

Validate Contact across:

- phones: portrait and landscape
- foldable phones: folded/outer portrait and landscape
- unfolded foldables: portrait and landscape
- tablets: portrait and landscape
- laptops/desktops: standard and wide
- Chromium
- Firefox
- WebKit

Landscape QA must include short-height and normal-height cases where applicable.

## Global Contact rules

- no form field, label, title, button, status message, or SVG may clip or escape the Contact section
- the Contact title `Let's keep in touch!` must remain on one line in every accepted geometry family; tune title size and available form width rather than allowing the title to wrap
- success/error status messages may wrap to multiple lines when needed; wrapping by itself is not a failure as long as the message remains contained, readable, and intentionally spaced below the Send button
- no form/SVG collision
- labels and typed text must remain readable
- all controls must remain reachable and usable
- textarea must retain useful writing space
- spacing is part of the design; a technically non-overlapping but cramped form is not accepted
- when height is constrained, scale padding, gaps, SVG size, typography, and field heights before allowing clipping
- the Contact background must visually continue the established site color family from Portfolio
- Motion should begin when Contact enters view, but animation must not alter the accepted settled geometry

---

## 1. Phones — Portrait

Preferred content order:

```text
CONTACT SVG / ILLUSTRATION
  ↓
CONTACT FORM
```

Inside the form:

```text
TITLE
  ↓
NAME
  ↓
EMAIL
  ↓
MESSAGE
  ↓
SEND BUTTON
  ↓
STATUS MESSAGE (when present)
```

Requirements:

- SVG/illustration appears first and stays contained near the top of the portrait composition
- form follows below the SVG and remains the primary interactive content
- form is centered horizontally within the available viewport
- form title remains readable and stays on one line
- labels left-aligned
- inputs/textarea use the available width without touching viewport edges
- textarea remains tall enough to be useful
- send button fully visible and easy to tap
- success/error text must not push important controls outside the viewport
- if the full SVG cannot remain useful without crowding the form, reduce its visual footprint before shrinking form usability
- preserve deliberate vertical spacing between SVG and form and between form components

## 1. Phones — Landscape

Preferred composition:

```text
FORM        CONTACT SVG
```

Requirements:

- form on the left side
- SVG/illustration on the right side
- both vertically centered where practical
- form remains the priority on very short landscape heights
- title, fields, textarea, and button must all remain visible and usable
- title must remain on one line
- reduce SVG size first when vertical pressure becomes severe
- reduce form padding/gaps and typography carefully before reducing field usability
- no form/SVG overlap
- short landscape and normal landscape are separate QA tiers

---

## 2a. Foldable Phones — Folded/Outer Portrait

Use the phone-portrait pattern:

```text
CONTACT SVG / ILLUSTRATION
  ↓
CONTACT FORM
```

Requirements:

- SVG remains contained on the narrow outer display
- form remains fully usable below it
- labels and inputs stay readable
- message field remains practical
- SVG scales down without pushing the form out of view
- spacing should remain intentional rather than compressed
- title remains on one line

## 2a. Foldable Phones — Folded/Outer Landscape

Use the landscape two-region pattern:

```text
FORM        CONTACT SVG
```

Requirements:

- form left, SVG right
- very short outer-display landscape heights prioritize form usability
- SVG may become substantially smaller when necessary
- form controls must not clip
- title remains on one line

---

## 2b. Foldables — Unfolded Portrait

Use the portrait-first vertical composition:

```text
CONTACT SVG / ILLUSTRATION
  ↓
CONTACT FORM
```

Requirements:

- take advantage of the larger unfolded width
- do not leave the form at narrow-phone sizing
- increase form width, spacing, and SVG scale appropriately
- maintain clear hierarchy between illustration and form
- no excessive unused space between the two regions
- title remains on one line

## 2b. Foldables — Unfolded Landscape

Use the two-column pattern:

```text
FORM        CONTACT SVG
```

Requirements:

- balanced left/right regions
- form remains readable and proportionate
- SVG scales appropriately for the larger display
- neither side should dominate excessively
- title remains on one line

---

## 3. Tablets — Portrait

Preferred composition:

```text
CONTACT SVG / ILLUSTRATION
  ↓
CONTACT FORM
```

Requirements:

- form should scale beyond phone dimensions
- fields, textarea, title, and button should use tablet space naturally
- SVG remains meaningful rather than becoming a tiny header graphic
- spacing should breathe more than phone layouts when height permits
- title remains on one line

## 3. Tablets — Landscape

Preferred composition:

```text
FORM        CONTACT SVG
```

Requirements:

- two balanced columns
- form left, SVG right
- title and fields remain readable
- title remains on one line
- SVG contained within its region
- short-height tablet landscape requires its own compact treatment if needed

---

## 4. Laptops / Desktops — Standard and Wide

Expected composition:

```text
FORM        CONTACT SVG
```

Requirements:

- preserve the Lama-style two-section composition
- form and illustration remain visually balanced
- title, fields, textarea, button, SVG, gaps, and outer padding scale appropriately with viewport size
- title remains on one line
- standard laptops must not feel oversized
- wide/high-resolution desktops must not leave small laptop-sized content floating in excessive empty space
- wide layouts should scale up without making the form or SVG excessively large
- form and SVG must remain vertically centered and contained

---

## Form-specific QA requirements

Every geometry should check:

- title containment and single-line presentation
- label containment
- input containment
- textarea containment
- button containment
- success/error message containment; success/error text may wrap when needed
- minimum readable font sizes
- adequate field heights
- textarea usable height
- sensible vertical gaps between fields
- no field/button overlap
- no form/SVG overlap
- no horizontal document overflow

If the form is wired to EmailJS or another submission system, geometry QA and functional submission QA remain separate. A geometry PASS does not imply successful network submission.

## Motion / SVG QA

- form entry Motion should trigger when Contact enters view
- settled form geometry is measured after animation completes
- portrait phone/foldable/tablet entry may use the approved fade-only variants; geometry QA measures the settled state
- animated SVG paths/groups must remain inside the SVG region
- animation should not create document overflow or persistent clipping
- WebKit should receive explicit visual review because SVG/Motion rendering can differ from Chromium

## QA acceptance principles

Contact is accepted only when automated measurements and manual screenshot review both support the intended design.

If a metric contradicts an obviously correct screenshot, fix the QA contract. If a screenshot is visibly wrong despite a PASS, fix the geometry or the missing contract rule.

Candidate Contact CSS should live under `qa/contact-viewport-audit/candidates/` and remain separate from production until manually accepted.

Final closure requires Chromium, Firefox, and WebKit coverage before Contact is promoted to `starter` and frozen.
