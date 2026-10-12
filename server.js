import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import contactHandler from "./api/contact.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const distDirectory = path.join(currentDirectory, "dist");
const indexFile = path.join(distDirectory, "index.html");

app.disable("x-powered-by");

/*
 * Keep /api/contact server-side. The handler reads the raw request body itself
 * so its existing size limit, validation, Redis rate limits, cooldown, and
 * EmailJS delivery logic remain authoritative.
 */
app.all("/api/contact", contactHandler);

/* Do not let unknown API paths fall through to the SPA shell. */
app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
  });
});

/* Serve the production Vite build. */
app.use(express.static(distDirectory));

/*
 * Vite is a client-side SPA, so non-file GET/HEAD requests should return
 * index.html and let React handle the route/hash in the browser.
 */
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }

  res.sendFile(indexFile);
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[Portfolio] Server listening on port ${port}`);
});
