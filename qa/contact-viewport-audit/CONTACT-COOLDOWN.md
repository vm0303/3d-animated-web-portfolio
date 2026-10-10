# Contact cooldown / abuse protection

## Behavior

After a successful Contact submission, the visitor is blocked from sending another message for 3 hours by default.

The server checks two hashed identities:

- normalized submitted email address;
- client IP address when available.

If either identity is still cooling down, `/api/contact` returns HTTP `429` with the remaining seconds. The browser then displays:

```text
Message limit reached. You can send another message in 2h 47m.
```

The Send button remains disabled while the browser knows a cooldown is active.

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

Cooldown geometry is tested by visual DOM injection at representative labels:

```text
3h 0m
2h 47m
8m
```

Run all currently locked device families with:

```powershell
node qa/contact-viewport-audit/run-contact-locked-cooldown-qa.cjs --browser=chromium --screenshots=all
```

Future geometry-family passes automatically include geometry, success/error, and cooldown visual checks through `run-contact-geometry-family-pass.cjs`.
