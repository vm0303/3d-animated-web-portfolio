# Contact Geometry Family Pass Policy

This rule applies to every remaining Contact geometry family and to any future Contact geometry rerun.

## Mandatory combined pass

A Contact geometry family is **not eligible to lock** from `run-contact-composition-qa.cjs` alone.

Every family pass must run both:

1. the normal Contact geometry / motion QA; and
2. the visual success/error status-message QA.

Use:

```text
qa/contact-viewport-audit/run-contact-geometry-family-pass.cjs
```

The combined runner forwards the same family, orientation, viewport filters, browser, and candidate `--override-css` to both QA stages.

## Success/error status rule

For every tested viewport, verify the settled visual geometry of both status messages:

- `Message sent! Thanks! I'll get back to you as soon as I can.`
- `Failed to send message. Please try again later`

The messages must:

- remain fully inside Contact;
- remain fully inside the form/status region;
- create no horizontal document overflow;
- preserve intentional breathing room below the Send button;
- not collide with or visually crowd the Send button;
- not push the accepted form geometry outside the Contact section.

## No EmailJS requests during geometry QA

Status-message geometry is tested by temporary visual DOM injection only.

The geometry family pass must **not**:

- submit the Contact form;
- invoke EmailJS;
- send network requests to EmailJS;
- consume EmailJS quota;
- mock a successful or failed EmailJS response.

The status visual runner reproduces only the settled rendered state of the existing `successMessage` and `errorMessage` spans (`opacity: 1`, `translateY(0)`). Functional EmailJS submission behavior remains a separate final functional check.

## Screenshot rule

By default, the combined family pass captures all geometry screenshots and all success/error status screenshots. This allows manual review of spacing in addition to automated containment checks.

Optional controls:

```text
--geometry-screenshots=all|bad|none
--status-screenshots=all|bad|none
```

Do not suppress status visual testing simply to reduce screenshots; screenshot mode changes image output only, not whether the status states are checked.

## Lock rule

A family may be locked only after:

- geometry has no unresolved hard failures;
- manual screenshots confirm the intended composition and breathing room;
- success status geometry is accepted;
- error status geometry is accepted.

This policy applies to:

- phone landscape;
- folded-outer landscape;
- unfolded-inner portrait;
- unfolded-inner landscape;
- tablet portrait;
- tablet landscape;
- standard laptop/desktop;
- wide desktop;
- any later Contact regression or closure rerun.
