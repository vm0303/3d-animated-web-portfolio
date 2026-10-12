import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: ["dist"],
  },

  {
    files: ["**/*.{js,jsx}"],

    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,

      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: {
          jsx: true,
        },
        sourceType: "module",
      },
    },

    settings: {
      react: {
        version: "18.3",
      },
    },

    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },

    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,

      "no-unused-vars": "warn",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",

      /*
       * React Three Fiber uses Three.js JSX properties such as geometry,
       * material, position, rotation, args, intensity, etc.
       */
      "react/no-unknown-property": "off",

      /*
       * Preserve approved portfolio copy without forcing HTML entities
       * into visible JSX text.
       */
      "react/no-unescaped-entities": "off",

      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
    },
  },

  /*
   * Server-side / build configuration files run in Node rather than
   * the browser, so expose Node globals such as process and Buffer.
   */
  {
    files: [
      "api/**/*.js",
      "server.js",
      "vite.config.js",
    ],

    languageOptions: {
      globals: globals.node,
    },
  },
];