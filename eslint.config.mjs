/**
 * Root ESLint flat config for the BugRout monorepo.
 *
 * Single source of truth for all workspaces — running `eslint .` in any
 * workspace resolves up to this file. All plugins are root devDependencies
 * (pnpm's isolated node_modules means only the root can resolve them).
 *
 * All `files` globs are written relative to the repo root, never bare
 * `**\/*.tsx`, so per-area blocks scope correctly regardless of CWD.
 *
 * See GitHub issues #1 and #2 for the rule rationale, and docs/adr/ for
 * the decisions adapting the stack to this RN/Workers monorepo.
 */
import js from "@eslint/js";
import { fixupPluginRules } from "@eslint/compat";
import expo from "eslint-plugin-expo";
import importX from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import jsdoc from "eslint-plugin-jsdoc";
import n from "eslint-plugin-n";
import noSecrets from "eslint-plugin-no-secrets";
import promise from "eslint-plugin-promise";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactNativeA11y from "eslint-plugin-react-native-a11y";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ── Global ignores ────────────────────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.expo/**",
      "**/.turbo/**",
      "**/.wrangler/**",
      "**/*.d.ts",
      "apps/mobile/native-modules/**",
      "apps/mobile/ios/**",
      "apps/mobile/android/**",
      "data-pipeline/**",
      "reports/**",
    ],
  },

  // ── TypeScript: repo-wide type-checked strict base ────────────────────
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      sonarjs,
      security,
      unicorn,
      "import-x": importX,
      promise,
      jsdoc,
      "no-secrets": noSecrets,
    },
    settings: {
      jsdoc: { mode: "typescript" },
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          project: [
            "apps/mobile/tsconfig.json",
            "packages/*/tsconfig.json",
            "backend/workers/*/tsconfig.json",
            "backend/services/route-tracker/tsconfig.json",
          ],
        }),
      ],
    },
    rules: {
      // TypeScript
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        // React event-handler props (onPress etc.) routinely take async fns
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      // Issue #2 baseline, tuned for this codebase:
      // - PascalCase functions allowed (React components)
      // - object/type properties exempt (external API payloads: Nominatim
      //   display_name, USFS LATITUDE, HTTP headers, MapLibre style keys)
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"] },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
        },
        {
          selector: "variable",
          modifiers: ["destructured"],
          format: null,
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
        },
        {
          selector: "parameter",
          format: ["camelCase", "PascalCase"],
          leadingUnderscore: "allow",
        },
        {
          selector: "memberLike",
          modifiers: ["private"],
          format: ["camelCase"],
          leadingUnderscore: "require",
        },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase", "UPPER_CASE"] },
        { selector: "import", format: ["camelCase", "PascalCase"] },
        {
          selector: [
            "objectLiteralProperty",
            "typeProperty",
            "objectLiteralMethod",
          ],
          format: null,
        },
      ],

      // Code quality (sonarjs)
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-duplicate-string": ["error", { threshold: 4 }],
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-redundant-boolean": "error",
      "sonarjs/no-redundant-jump": "error",
      "sonarjs/no-small-switch": "error",
      "sonarjs/no-unused-collection": "error",
      "sonarjs/no-useless-catch": "error",
      "sonarjs/prefer-immediate-return": "error",
      "sonarjs/prefer-single-boolean-return": "error",

      // File/function size
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "error",
        { max: 75, skipBlankLines: true, skipComments: true },
      ],
      complexity: ["error", { max: 10 }],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 3],
      "max-params": ["error", 4],

      // Security
      "security/detect-object-injection": "warn",
      "security/detect-non-literal-regexp": "error",
      "security/detect-non-literal-fs-filename": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-pseudoRandomBytes": "error",

      // Unicorn (targeted, not the full recommended set)
      "unicorn/filename-case": [
        "error",
        {
          cases: { kebabCase: true, camelCase: true, pascalCase: true },
          // Acronym-prefixed services (NWSService, FEMAService, USGSService…)
          ignore: [String.raw`^[A-Z]{2,}[A-Za-z]*\.`],
        },
      ],
      "unicorn/no-instanceof-builtins": "error",
      "unicorn/no-invalid-remove-event-listener": "error",
      "unicorn/no-useless-promise-resolve-reject": "error",
      "unicorn/prefer-array-find": "error",
      "unicorn/prefer-includes": "error",
      "unicorn/prefer-string-starts-ends-with": "error",

      // Imports
      "import-x/no-cycle": ["error", { maxDepth: 10 }],
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/no-duplicates": "error",
      "import-x/no-unresolved": ["error", { ignore: ["\\.(png|jpg|ttf)$"] }],
      "import-x/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-default-export": "error",

      // Promise correctness
      "promise/no-return-wrap": "error",
      "promise/param-names": "error",
      "promise/catch-or-return": ["error", { allowFinally: true }],
      "promise/no-nesting": "warn",

      // JSDoc/TSDoc on exports
      "jsdoc/require-jsdoc": [
        "error",
        {
          contexts: [
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > VariableDeclaration",
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
          ],
          checkConstructors: false,
        },
      ],
      "jsdoc/require-description": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns-description": "error",
      "jsdoc/no-undefined-types": "off",
      "jsdoc/check-tag-names": [
        "error",
        { definedTags: ["remarks", "public", "internal", "beta"] },
      ],

      // Secrets (complements gitleaks)
      "no-secrets/no-secrets": [
        "error",
        { tolerance: 4.5, ignoreContent: ["https?://", "data:image/"] },
      ],
    },
  },

  // ── Mobile app: React / React Native / Expo / RN accessibility ────────
  {
    files: ["apps/mobile/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-native-a11y": fixupPluginRules(reactNativeA11y),
      expo,
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        __DEV__: "readonly",
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // React
      "react/jsx-key": [
        "error",
        { checkFragmentShorthand: true, warnOnDuplicates: true },
      ],
      "react/jsx-no-leaked-render": "error",
      "react/jsx-pascal-case": "error",
      "react/no-array-index-key": "warn",
      "react/no-unstable-nested-components": "error",
      "react/self-closing-comp": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // React Native accessibility (DOM-based tooling doesn't apply here —
      // see docs/adr/0003-react-native-a11y-linting.md)
      ...reactNativeA11y.configs.all.rules,

      // Expo
      "expo/no-env-var-destructuring": "error",
      "expo/no-dynamic-env-var": "error",
    },
  },

  // ── Cloudflare Workers: service-worker runtime, not Node ──────────────
  {
    files: ["backend/workers/**/*.ts"],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
    rules: {
      // Workers module syntax requires `export default { fetch }`
      "import-x/no-default-export": "off",
    },
  },

  // ── Platform wrappers: conditional require() of native modules with
  //    mock fallbacks for web/Expo Go is the documented pattern here ─────
  {
    files: ["apps/mobile/platform/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },

  // ── Node surfaces: Fly.io service + elf-model CLI scripts ─────────────
  {
    files: [
      "backend/services/route-tracker/**/*.ts",
      "packages/elf-model/src/**/*.ts",
    ],
    plugins: { n },
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "n/no-deprecated-api": "error",
      "n/no-sync": ["error", { allowAtRootLevel: true }],
      "n/prefer-promises/fs": "error",
      "n/prefer-promises/dns": "error",
    },
  },

  // ── Expo Router screens: default exports are required by the router ───
  {
    files: ["apps/mobile/app/**/*.{ts,tsx}"],
    rules: {
      "import-x/no-default-export": "off",
      "jsdoc/require-jsdoc": "off",
    },
  },

  // ── Config files (CJS/TS, often outside any tsconfig program) ─────────
  {
    files: [
      "**/*.config.{js,cjs,mjs,ts}",
      "**/.detoxrc.js",
      "**/babel.config.js",
      "scripts/**/*.{js,mjs}",
    ],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "commonjs",
    },
    rules: {
      "import-x/no-default-export": "off",
      "jsdoc/require-jsdoc": "off",
    },
  },
  {
    files: ["**/*.config.{mjs,ts}", "eslint.config.mjs"],
    languageOptions: { sourceType: "module" },
  },

  // ── Tests (Jest) ───────────────────────────────────────────────────────
  {
    files: [
      "**/__tests__/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
    ],
    languageOptions: {
      globals: { ...globals.jest },
    },
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "max-nested-callbacks": ["error", 5],
      "sonarjs/no-duplicate-string": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
      "jsdoc/require-jsdoc": "off",
      "no-secrets/no-secrets": "off",
    },
  },

  // ── Detox E2E: excluded from the mobile tsconfig (no type program) ────
  {
    files: ["apps/mobile/e2e/**/*.{ts,js}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        ...globals.jest,
        device: "readonly",
        element: "readonly",
        by: "readonly",
        waitFor: "readonly",
      },
    },
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "max-nested-callbacks": ["error", 5],
      "sonarjs/no-duplicate-string": "off",
      "jsdoc/require-jsdoc": "off",
      // detox is provided by the E2E runner environment, not a workspace dep
      "import-x/no-unresolved": "off",
    },
  },

  // ── Prettier compatibility: must stay last ─────────────────────────────
  prettier,
);
