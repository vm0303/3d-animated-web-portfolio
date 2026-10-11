import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from "node:fs";
import path from "node:path";
import contactApiHandler from "./api/contact.js";


const contactApiDevMiddleware = () => ({
  name: "portfolio-contact-api-dev",

  configureServer(server) {
    server.middlewares.use(
      "/api/contact",

      (req, res) => {
        Promise
          .resolve(
            contactApiHandler(req, res)
          )
          .catch((error) => {
            console.error(
              "[Contact API] Unhandled local-dev error:",
              error
            );

            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader(
                "Content-Type",
                "application/json; charset=utf-8"
              );
            }

            if (!res.writableEnded) {
              res.end(
                JSON.stringify({
                  ok: false,
                  code: "CONTACT_API_ERROR",
                })
              );
            }
          });
      }
    );
  },
});


const qaJsonWriter = () => ({
  name: "portfolio-qa-json-writer",

  configureServer(server) {
    server.middlewares.use(
      "/__qa/observations",

      (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        let body = "";

        req.setEncoding("utf8");

        req.on("data", (chunk) => {
          body += chunk;
        });

        req.on("end", () => {
          try {
            const report = JSON.parse(body);

            const outputDir = path.join(
              process.cwd(),
              "qa-results",
              "hero"
            );

            fs.mkdirSync(outputDir, {
              recursive: true,
            });

            const width =
              report?.viewport?.inner?.width ??
              "unknown";

            const height =
              report?.viewport?.inner?.height ??
              "unknown";

            const orientation =
              report?.viewport?.layoutMode ??
              "unknown";

            const label =
              report?.qaLabel ||
              "unlabeled";

            const safeLabel = String(label)
              .trim()
              .replace(/[^a-zA-Z0-9-_]+/g, "-")
              .replace(/^-+|-+$/g, "");

            const timestamp =
              new Date()
                .toISOString()
                .replace(/[:.]/g, "-");

            const filename =
              `${safeLabel}__` +
              `${width}x${height}__` +
              `${orientation}__` +
              `${timestamp}.json`;

            const filePath =
              path.join(
                outputDir,
                filename
              );

            fs.writeFileSync(
              filePath,
              JSON.stringify(
                report,
                null,
                2
              ),
              "utf8"
            );

            /*
              Also maintain one easy-to-find file
              containing the most recent capture.
            */
            fs.writeFileSync(
              path.join(
                outputDir,
                "latest.json"
              ),
              JSON.stringify(
                report,
                null,
                2
              ),
              "utf8"
            );

            res.statusCode = 200;

            res.setHeader(
              "Content-Type",
              "application/json"
            );

            res.end(
              JSON.stringify({
                ok: true,
                filename,
              })
            );
          } catch (error) {
            console.error(
              "[Portfolio QA] Failed to save JSON:",
              error
            );

            res.statusCode = 500;

            res.setHeader(
              "Content-Type",
              "application/json"
            );

            res.end(
              JSON.stringify({
                ok: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown error",
              })
            );
          }
        });
      }
    );
  },
});


// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  /*
   * Vite normally exposes .env values through import.meta.env.
   * The Contact endpoint is server-side, so load the same local .env file
   * into process.env for the development middleware.
   */
  const env = loadEnv(
    mode,
    process.cwd(),
    ""
  );

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return {
    plugins: [
      react(),
      contactApiDevMiddleware(),
      qaJsonWriter(),
    ],

    server: {
      host: true,
    },
  };
});
