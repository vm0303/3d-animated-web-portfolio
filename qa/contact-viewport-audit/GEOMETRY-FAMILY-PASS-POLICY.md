# Contact Geometry Family Pass Policy

This rule applies to every Contact geometry family and every final Contact regression/closure rerun.

## Mandatory unified pass

Geometry/motion, success/error status visuals, and cooldown visuals are tested in **one viewport pass**, not as three independent suites.

Use:

```text
qa/contact-viewport-audit/run-contact-geometry-family-pass.cjs
```

That entry point runs the unified Contact QA runner. For each viewport it:

1. loads Contact once;
2. verifies the entry-motion contract and settled geometry;
3. verifies the settled success message;
4. verifies the settled error message;
5. verifies all four cooldown/countdown strings;
6. writes one combined viewport verdict and one combined report tree.

There are no `geometry/`, `status-visual/`, or `cooldown-visual/` subpasses in the normal family/closure workflow.

## Three-engine exhaustive closure

For final closure, use:

```text
--browser=all
```

The family-pass entry point runs Chromium, Firefox, and WebKit sequentially from the same command and writes one folder per engine under the requested output directory, plus `combined-summary.json` at the root.

Each browser still performs the full unified geometry + success + error + four-cooldown-state validation for every selected viewport.

## Animation-settle rule

Screenshots and injected visual states must not be captured while the Contact entrance animation is still progressing.

The unified runner first measures the inactive entry state, scrolls Contact into view, then waits until the form, SVG visual, title, form items, and Send button have reached their settled opacity/translation state. Only then are geometry screenshots and status/cooldown visual checks allowed.

A fixed sleep alone is not considered sufficient for final Contact certification.

## Success/error status rule

For every tested viewport, verify the settled visual geometry of both status messages:

- `Message sent! Thanks! I'll get back to you as soon as I can.`
- `Failed to send message. Please try again later`

The messages must:

- remain fully inside Contact;
- remain fully inside the form/status region;
- create no horizontal document overflow;
- preserve intentional breathing room below the Send button;
- not push the accepted form geometry outside the Contact section.

Visual DOM injection may be retried if a late React render replaces the temporary QA fixture. The retry is only for the non-submitting visual fixture; it does not mock application success/failure behavior.

## Cooldown/countdown status rule

For every tested viewport, verify all four production-format countdown shapes:

- `Message limit reached. Try again in 3h 0m.`
- `Message limit reached. Try again in 2h 47m.`
- `Message limit reached. Try again in 8m.`
- `Message limit reached. Try again in 5s.`

The cooldown state must:

- remain fully inside Contact and the form/status region;
- allow normal text wrapping when needed;
- preserve intentional breathing room below the Send button;
- create no horizontal overflow;
- keep Send visually/semantically blocked with `aria-disabled` while avoiding native `disabled` so the reminder remains interactive;
- not change or invalidate previously locked geometry.

## No EmailJS or Contact API requests during visual QA

Success, error, and cooldown geometry are tested by temporary settled-state DOM injection only.

The unified pass must not:

- submit the Contact form;
- invoke `/api/contact`;
- invoke EmailJS;
- consume EmailJS quota;
- mock a successful, failed, or rate-limited EmailJS response.

The unified runner tracks these safety counters and also blocks Contact API / EmailJS requests during visual QA as a fail-safe.

Functional Contact API, EmailJS delivery, and persistent rate-limiter behavior remain separate functional checks.

## Screenshot rule

For exhaustive manual review, use:

```text
--screenshots=all
```

`all` writes exactly **one settled normal-state Contact screenshot per viewport per browser**. Success/error/cooldown states are still fully validated in the same page lifecycle and recorded in `report.json`; they do not multiply the normal screenshot count.

For the full 428-case matrix across Chromium, Firefox, and WebKit, a clean run therefore produces:

```text
428 x 3 = 1,284 PNG screenshots
```

The three-engine output layout is:

```text
<output-dir>/
  combined-summary.json
  chromium/
    report.json
    summary.json
    screenshots/
  firefox/
    report.json
    summary.json
    screenshots/
  webkit/
    report.json
    summary.json
    screenshots/
```

`--screenshots=bad` remains available for debugging non-PASS states, and `--screenshots=none` runs all automated checks without normal screenshots.

The older standalone status/cooldown runners may remain available for targeted debugging, but they are not part of the normal family-pass or final closure workflow.

## Readability regression floors

Readability thresholds are regression floors calibrated below the already-approved locked Contact geometry. They exist to catch a future shrink/regression; they are not a request to retune an accepted family during final closure.

## Lock / closure rule

A family or final closure run is accepted only after:

- geometry has no unresolved hard failures;
- entry motion reaches the settled state before capture;
- success and error visual states pass;
- all four cooldown visual states pass;
- Contact API / EmailJS / form-submission visual-QA counters remain zero;
- manual screenshots, when requested, confirm the intended composition and breathing room.

This policy applies to phones, folded/unfolded foldables, tablets, standard desktop, wide desktop, and later Contact regression/closure reruns.
