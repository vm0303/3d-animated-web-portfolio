import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
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
    ],

    server: {
      host: true,
    },
  };
});
