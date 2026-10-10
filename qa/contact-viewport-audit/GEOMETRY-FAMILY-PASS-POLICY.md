# Contact Geometry Family Pass Policy

This rule applies to every remaining Contact geometry family and to any future Contact geometry rerun.

## Mandatory combined pass

A Contact geometry family is **not eligible to lock** from `run-contact-composition-qa.cjs` alone.

Every family pass must run all three stages:

1. the normal Contact geometry / motion QA;
2. the visual success/error status-message QA; and
3. the visual cooldown/countdown status QA.

Use:

```text
qa/contact-viewport-audit/run-contact-geometry-family-pass.cjs
```

The combined runner forwards the same family, orientation, viewport filters, browser, and candidate `--override-css` to all QA stages.

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

## Cooldown/countdown status rule

The cooldown state is part of Contact's permanent rendered-state contract.

For every tested viewport, verify representative countdown lengths:

- `Message limit reached. You can send another message in 3h 0m.`
- `Message limit reached. You can send another message in 2h 47m.`
- `Message limit reached. You can send another message in 8m.`

The cooldown state must:

- remain fully inside Contact and the form/status region;
- allow normal text wrapping when needed;
- preserve intentional breathing room below the Send button;
- create no horizontal overflow;
- leave the Send button visibly disabled;
- not change or invalidate a geometry family that was previously locked.

## No EmailJS or Contact API requests during geometry QA

Success, error, and cooldown geometry are tested by temporary visual DOM injection only.

The geometry family pass must **not**:

- submit the Contact form;
- invoke `/api/contact`;
- invoke EmailJS;
- send network requests to EmailJS;
- consume EmailJS quota;
- mock a successful, failed, or rate-limited EmailJS response.

The visual runners reproduce only settled rendered UI states. Functional Contact API, EmailJS delivery, and persistent rate-limiter behavior remain separate functional checks.

## Screenshot rule

By default, the combined family pass captures all geometry screenshots, all success/error status screenshots, and all cooldown screenshots. This allows manual review of spacing in addition to automated containment checks.

Optional controls:

```text
--geometry-screenshots=all|bad|none
--status-screenshots=all|bad|none
--cooldown-screenshots=all|bad|none
```

Do not suppress status or cooldown visual testing simply to reduce screenshots; screenshot mode changes image output only, not whether those states are checked.

## Lock rule

A family may be locked only after:

- geometry has no unresolved hard failures;
- manual screenshots confirm the intended composition and breathing room;
- success status geometry is accepted;
- error status geometry is accepted;
- cooldown/countdown status geometry is accepted.

This policy applies to:

- phone portrait;
- phone landscape;
- folded-outer portrait;
- folded-outer landscape;
- unfolded-inner portrait;
- unfolded-inner landscape;
- tablet portrait;
- tablet landscape;
- standard laptop/desktop;
- wide desktop;
- any later Contact regression or closure rerun.
