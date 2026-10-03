# Responsive Geometry Source of Truth

Use this index when continuing responsive work in a new chat or after context loss.

## Frozen / completed sections

- Hero: completed/frozen through its existing QA and closure workflow.
- About: completed/frozen through its existing QA and closure workflow.

Do not reopen frozen Hero/About geometry without a demonstrated regression.

## Portfolio

Authoritative Portfolio geometry contract:

`qa/portfolio-viewport-audit/GEOMETRY-SPEC.md`

Key rules:

- portrait phones/foldables/tablets: image → title → text → button
- phone/foldable portrait title stays one line where explicitly required
- portrait paragraph is left-aligned
- landscape/tablet/laptop composition: image left, title/text/button right
- short landscape is a separate pressure tier
- phones/foldables/tablets use swipe/drag + dots, with no carousel arrows
- laptop/desktop arrows are interaction-only and fade in/out
- all five projects must be tested
- final certification: Chromium + Firefox + WebKit

## Contact

Starting Contact geometry contract:

`qa/contact-viewport-audit/GEOMETRY-SPEC.md`

This Contact contract is based on the selected Lama Dev structure: contact form + animated Contact SVG, adapted to the project's geometry-first responsive standards. Update that file after the final Contact implementation is visually approved.

## General workflow

For Portfolio and Contact:

1. establish baseline
2. identify real geometry failures and QA false positives/negatives
3. correct the QA contract before tuning CSS when needed
4. keep candidate CSS isolated under the section's `qa/.../candidates/` directory
5. run focused failing families first
6. manually review screenshots
7. run full family coverage
8. lock accepted families
9. run Chromium / Firefox / WebKit certification
10. promote accepted runtime CSS/code to `starter`
11. run production closure
12. freeze the section

Manual visual review remains part of the source of truth. A numerical PASS is not sufficient when the screenshot visibly violates the section's geometry specification.
