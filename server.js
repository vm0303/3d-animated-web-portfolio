import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import contactHandler from "./api/contact.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, "dist");
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function hasAnyEmailJsCredentials() {
  const serviceId =
    process.env.EMAILJS_SERVICE_ID ||
    process.env.VITE_SERVICE_ID;

  const templateId =
    process.env.EMAILJS_TEMPLATE_ID ||
    process.env.VITE_TEMPLATE_ID;

  const publicKey =
    process.env.EMAILJS_PUBLIC_KEY ||
    process.env.VITE_PUBLIC_KEY;

  return Boolean(serviceId && templateId && publicKey);
}

function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing = [];

  if (!hasAnyEmailJsCredentials()) {
    missing.push(
      "EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY"
    );
  }

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    missing.push("UPSTASH_REDIS_REST_URL");
  }

  if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
    missing.push("UPSTASH_REDIS_REST_TOKEN");
  }

  if (!process.env.CONTACT_COOLDOWN_SECRET) {
    missing.push("CONTACT_COOLDOWN_SECRET");
  }

  if (missing.length) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(
        ", "
      )}`
    );
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function resolveStaticPath(pathname) {
  let decoded;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requested = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(DIST_DIR, `.${requested}`);
  const distPrefix = `${path.resolve(DIST_DIR)}${path.sep}`;

  if (
    resolved !== path.resolve(DIST_DIR) &&
    !resolved.startsWith(distPrefix)
  ) {
    return null;
  }

  return resolved;
}

function sendFile(req, res, filePath, { spaFallback = false } = {}) {
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      if (spaFallback) {
        sendFile(req, res, path.join(DIST_DIR, "index.html"));
        return;
      }

      sendJson(res, 404, {
        ok: false,
        code: "NOT_FOUND",
      });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType =
      MIME_TYPES[extension] || "application/octet-stream";

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (path.basename(filePath) === "index.html") {
      res.setHeader("Cache-Control", "no-cache");
    } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "public, max-age=3600");
    }

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);

    stream.on("error", (error) => {
      console.error("[Server] Static file read failed:", error);

      if (!res.headersSent) {
        sendJson(res, 500, {
          ok: false,
          code: "STATIC_FILE_ERROR",
        });
      } else {
        res.destroy(error);
      }
    });

    stream.pipe(res);
  });
}

validateProductionEnvironment();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname === "/api/contact") {
    try {
      await contactHandler(req, res);
    } catch (error) {
      console.error("[Contact API] Unhandled request error:", error);

      if (!res.headersSent) {
        sendJson(res, 500, {
          ok: false,
          code: "CONTACT_INTERNAL_ERROR",
          message: "The contact form is temporarily unavailable.",
        });
      }
    }

    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 404, {
      ok: false,
      code: "API_NOT_FOUND",
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    sendJson(res, 405, {
      ok: false,
      code: "METHOD_NOT_ALLOWED",
    });
    return;
  }

  const staticPath = resolveStaticPath(url.pathname);

  if (!staticPath) {
    sendJson(res, 400, {
      ok: false,
      code: "INVALID_PATH",
    });
    return;
  }

  const hasExtension = Boolean(path.extname(url.pathname));

  sendFile(req, res, staticPath, {
    spaFallback: !hasExtension,
  });
});

server.listen(PORT, HOST, () => {
  console.log(
    `[Server] Portfolio listening on http://${HOST}:${PORT} (${process.env.NODE_ENV || "development"})`
  );
});
