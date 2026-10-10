# Contact cooldown / abuse protection

## Behavior

After a successful Contact submission, the visitor is blocked from sending another message for 3 hours by default.

The server checks two hashed identities:

- normalized submitted email address;
- client IP address when available.

If either identity is still cooling down, `/api/contact` returns HTTP `429` with the remaining seconds. The browser then displays:

```text
Message limit reached. Try again in 2h 47m.
```

The Send control keeps its disabled appearance during cooldown, but uses `aria-disabled` rather than the native `disabled` attribute so it can remain informative and interactive without permitting a submission.

When the cooldown reminder first appears it fades in and shakes briefly. After six seconds of no blocked-send attempts, it fades away. Pressing Send again during the cooldown immediately shows/shakes the reminder again and restarts the six-second inactivity timer. Repeated presses therefore keep the reminder active and keep resetting the fade-out window, while `Contact.jsx` still blocks the form before any Contact API or EmailJS request can occur.

The shake is skipped when the visitor has `prefers-reduced-motion: reduce` enabled.

`localStorage` stores the expiry only for UX continuity after a reload. It is **not** the security boundary. Clearing cache/cookies/localStorage or changing browsers does not remove the server-side cooldown.

## Delivery path

The browser no longer calls EmailJS directly.

```text
Contact.jsx
  -> POST /api/contact
  -> persistent email/IP cooldown check
  -> EmailJS REST API
```

The cooldown reservation is created atomically before EmailJS is called. If EmailJS fails, the reservation is released so a failed delivery does not consume the 3-hour window.

## Local development

`npx vite --host` serves `/api/contact` through the Vite development middleware.

For local development only, if Upstash is not configured, the API uses an in-memory cooldown map. This is sufficient to test the workflow across browser tabs/browsers while the same Vite process is running, but it is not production persistence.

Existing `VITE_SERVICE_ID`, `VITE_TEMPLATE_ID`, and `VITE_PUBLIC_KEY` values are accepted as a temporary local compatibility fallback.

## Preview / production deployment

Vercel preview/production requires persistent Upstash Redis configuration. The Contact API intentionally fails closed if deployed on Vercel without it.

Configure:

```text
EMAILJS_SERVICE_ID
EMAILJS_TEMPLATE_ID
EMAILJS_PUBLIC_KEY
EMAILJS_PRIVATE_KEY       # optional
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
CONTACT_COOLDOWN_SECRET
CONTACT_COOLDOWN_SECONDS  # optional; defaults to 10800
```

Use a long random value for `CONTACT_COOLDOWN_SECRET`. Raw email addresses and IP addresses are never written to Redis; HMAC-derived identifiers are used as cooldown keys.

## QA rule

Geometry QA must never submit the real form or consume EmailJS quota.

Cooldown geometry is tested by visual DOM injection using the same short production wording at four representative countdown formats:

```text
Message limit reached. Try again in 3h 0m.
Message limit reached. Try again in 2h 47m.
Message limit reached. Try again in 8m.
Message limit reached. Try again in 5s.
```

These four states exercise the live formatter shapes for hours/minutes, mixed hours/minutes, minutes-only, and seconds-only output.

Run all four states across every currently locked geometry family with:

```powershell
node qa/contact-viewport-audit/run-contact-locked-cooldown-qa.cjs --browser=chromium --screenshots=all
```

The dedicated interaction runner seeds a future cooldown timestamp into localStorage and tests the real React behavior without waiting hours:

```powershell
node qa/contact-viewport-audit/run-contact-cooldown-interaction-qa.cjs --browser=chromium
```

It verifies:

- exact `Message limit reached. Try again in 2h 47m.` copy;
- initial reminder/shake;
- six-second inactivity fade-out;
- blocked-click reminder restoration;
- timer reset after another blocked click;
- repeated-click shake/timer restart;
- zero form submissions;
- zero `/api/contact` requests;
- zero EmailJS requests.

Future geometry-family passes automatically include geometry, success/error, and cooldown visual checks through `run-contact-geometry-family-pass.cjs`.
