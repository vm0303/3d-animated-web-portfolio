import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from "node:fs";
import path from "node:path";


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
export default defineConfig({
  plugins: [
    react(),
    qaJsonWriter(),
  ],

  server: {
    host: true,
  },
});
