import crypto from "node:crypto";

const DEFAULT_COOLDOWN_SECONDS = 3 * 60 * 60;
const MAX_BODY_BYTES = 24_000;

/*
 * Local Vite development fallback only.
 * Production/preview deployments must use Upstash Redis so the cooldown
 * survives browser changes, cookie/cache clearing, and serverless instances.
 */
const localCooldowns = new Map();

const RESERVE_SCRIPT = `
local max_ttl = 0
for i, key in ipairs(KEYS) do
  local ttl = redis.call("TTL", key)
  if ttl > max_ttl then
    max_ttl = ttl
  end
end

if max_ttl > 0 then
  return max_ttl
end

for i, key in ipairs(KEYS) do
  redis.call("SET", key, ARGV[2], "EX", ARGV[1])
end

return 0
`;

const RELEASE_SCRIPT = `
for i, key in ipairs(KEYS) do
  if redis.call("GET", key) == ARGV[1] then
    redis.call("DEL", key)
  end
end
return 1
`;

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return String(value || "");
}

function clientIp(req) {
  const candidates = [
    firstHeaderValue(req.headers?.["x-vercel-forwarded-for"]),
    firstHeaderValue(req.headers?.["x-forwarded-for"]),
    firstHeaderValue(req.headers?.["x-real-ip"]),
    req.socket?.remoteAddress || "",
  ];

  const value = candidates
    .map((candidate) => candidate.split(",")[0].trim())
    .find(Boolean);

  return value?.replace(/^::ffff:/, "") || "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hmac(value, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(value)
    .digest("hex");
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  let body = "";

  for await (const chunk of req) {
    body += chunk;

    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
  }

  return body ? JSON.parse(body) : {};
}

function getConfiguration() {
  const emailJs = {
    serviceId:
      process.env.EMAILJS_SERVICE_ID ||
      process.env.VITE_SERVICE_ID ||
      "",
    templateId:
      process.env.EMAILJS_TEMPLATE_ID ||
      process.env.VITE_TEMPLATE_ID ||
      "",
    publicKey:
      process.env.EMAILJS_PUBLIC_KEY ||
      process.env.VITE_PUBLIC_KEY ||
      "",
    privateKey: process.env.EMAILJS_PRIVATE_KEY || "",
  };

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || "";
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  const hasRedis = Boolean(redisUrl && redisToken);
  const hasPartialRedis = Boolean(redisUrl || redisToken) && !hasRedis;
  const deployedOnVercel = Boolean(process.env.VERCEL_ENV);

  if (
    !emailJs.serviceId ||
    !emailJs.templateId ||
    !emailJs.publicKey
  ) {
    throw new Error(
      "Contact API is missing EmailJS server environment variables."
    );
  }

  if (hasPartialRedis) {
    throw new Error(
      "Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required."
    );
  }

  if (deployedOnVercel && !hasRedis) {
    throw new Error(
      "Persistent Contact cooldown requires Upstash Redis on Vercel."
    );
  }

  const secret =
    process.env.CONTACT_COOLDOWN_SECRET ||
    (deployedOnVercel ? "" : "local-contact-development-secret");

  if (!secret) {
    throw new Error("CONTACT_COOLDOWN_SECRET is required.");
  }

  return {
    emailJs,
    redis: hasRedis
      ? {
          url: redisUrl.replace(/\/$/, ""),
          token: redisToken,
        }
      : null,
    secret,
    cooldownSeconds: positiveInteger(
      process.env.CONTACT_COOLDOWN_SECONDS,
      DEFAULT_COOLDOWN_SECONDS
    ),
  };
}

async function redisCommand(redis, command) {
  const response = await fetch(redis.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redis.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  const result = await response.json();

  if (!response.ok || result?.error) {
    throw new Error(result?.error || "Redis request failed.");
  }

  return result.result;
}

function pruneLocalCooldowns() {
  const now = Date.now();

  for (const [key, record] of localCooldowns.entries()) {
    if (record.expiresAt <= now) {
      localCooldowns.delete(key);
    }
  }
}

async function reserveCooldown({ keys, seconds, token, redis }) {
  if (redis) {
    const result = await redisCommand(redis, [
      "EVAL",
      RESERVE_SCRIPT,
      String(keys.length),
      ...keys,
      String(seconds),
      token,
    ]);

    const retryAfterSeconds = Math.max(0, Number(result) || 0);

    return {
      allowed: retryAfterSeconds === 0,
      retryAfterSeconds,
    };
  }

  pruneLocalCooldowns();

  const now = Date.now();
  let latestExpiry = 0;

  for (const key of keys) {
    const record = localCooldowns.get(key);
    if (record?.expiresAt > latestExpiry) {
      latestExpiry = record.expiresAt;
    }
  }

  if (latestExpiry > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((latestExpiry - now) / 1000)
      ),
    };
  }

  const expiresAt = now + seconds * 1000;

  for (const key of keys) {
    localCooldowns.set(key, {
      token,
      expiresAt,
    });
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

async function releaseCooldown({ keys, token, redis }) {
  if (redis) {
    await redisCommand(redis, [
      "EVAL",
      RELEASE_SCRIPT,
      String(keys.length),
      ...keys,
      token,
    ]);
    return;
  }

  for (const key of keys) {
    const record = localCooldowns.get(key);
    if (record?.token === token) {
      localCooldowns.delete(key);
    }
  }
}

async function sendWithEmailJs({ emailJs, name, email, message }) {
  const payload = {
    service_id: emailJs.serviceId,
    template_id: emailJs.templateId,
    user_id: emailJs.publicKey,
    template_params: {
      name,
      email,
      message,
    },
  };

  if (emailJs.privateKey) {
    payload.accessToken = emailJs.privateKey;
  }

  const response = await fetch(
    "https://api.emailjs.com/api/v1.0/email/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `EmailJS send failed (${response.status}): ${responseText}`
    );
  }
}

export default async function contactHandler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    json(res, 405, {
      ok: false,
      code: "METHOD_NOT_ALLOWED",
    });
    return;
  }

  let body;

  try {
    body = await readJsonBody(req);
  } catch (error) {
    json(res, error?.statusCode || 400, {
      ok: false,
      code: "INVALID_REQUEST",
      message: "Unable to read the contact request.",
    });
    return;
  }

  const name = String(body?.name || "").trim();
  const email = normalizeEmail(body?.email);
  const message = String(body?.message || "").trim();
  const honeypot = String(body?.company_website || "").trim();

  /*
   * Quietly absorb obvious bot submissions. The browser receives the normal
   * success shape, but EmailJS is never called.
   */
  if (honeypot) {
    json(res, 200, {
      ok: true,
      cooldownSeconds: DEFAULT_COOLDOWN_SECONDS,
    });
    return;
  }

  if (
    !name ||
    name.length > 120 ||
    !isValidEmail(email) ||
    !message ||
    message.length > 5000
  ) {
    json(res, 400, {
      ok: false,
      code: "INVALID_FIELDS",
      message: "Please provide a valid name, email, and message.",
    });
    return;
  }

  let configuration;

  try {
    configuration = getConfiguration();
  } catch (error) {
    console.error("[Contact API] Configuration error:", error);
    json(res, 500, {
      ok: false,
      code: "CONTACT_CONFIGURATION_ERROR",
      message: "The contact form is temporarily unavailable.",
    });
    return;
  }

  const ip = clientIp(req);
  const identityKeys = [
    `portfolio:contact:email:${hmac(email, configuration.secret)}`,
  ];

  if (ip) {
    identityKeys.push(
      `portfolio:contact:ip:${hmac(ip, configuration.secret)}`
    );
  }

  const reservationToken = crypto.randomUUID();
  let reservation;

  try {
    reservation = await reserveCooldown({
      keys: identityKeys,
      seconds: configuration.cooldownSeconds,
      token: reservationToken,
      redis: configuration.redis,
    });
  } catch (error) {
    console.error("[Contact API] Cooldown check failed:", error);
    json(res, 503, {
      ok: false,
      code: "COOLDOWN_UNAVAILABLE",
      message: "The contact form is temporarily unavailable.",
    });
    return;
  }

  if (!reservation.allowed) {
    res.setHeader(
      "Retry-After",
      String(reservation.retryAfterSeconds)
    );

    json(res, 429, {
      ok: false,
      code: "CONTACT_COOLDOWN",
      retryAfterSeconds: reservation.retryAfterSeconds,
    });
    return;
  }

  try {
    await sendWithEmailJs({
      emailJs: configuration.emailJs,
      name,
      email,
      message,
    });

    json(res, 200, {
      ok: true,
      cooldownSeconds: configuration.cooldownSeconds,
    });
  } catch (error) {
    console.error("[Contact API] Email send failed:", error);

    try {
      await releaseCooldown({
        keys: identityKeys,
        token: reservationToken,
        redis: configuration.redis,
      });
    } catch (releaseError) {
      console.error(
        "[Contact API] Failed to release cooldown reservation:",
        releaseError
      );
    }

    json(res, 502, {
      ok: false,
      code: "EMAIL_SEND_FAILED",
      message: "Failed to send message. Please try again later.",
    });
  }
}
