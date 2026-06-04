# ADR 0006: ESLint composition decisions

- Status: Accepted
- Date: 2026-06-04
- Context: Issues #1 and #2 (lint stack, naming-convention)

## Decisions and rationale

1. **Hand-rolled mobile block instead of `eslint-config-expo`.** Expo's flat
   config registers its own `@typescript-eslint` plugin instance, which collides
   with `typescript-eslint`'s `strictTypeChecked` ("Cannot redefine plugin"). We
   register `eslint-plugin-expo` directly for its env-var rules and configure
   react/react-hooks/RN-a11y ourselves.
2. **No `eslint-plugin-react-refresh`.** It models Vite Fast Refresh boundaries;
   Expo Router requires export patterns that fight it.
3. **No `prettier-plugin-organize-imports`.** TS organize-imports sorting
   conflicts with the enforced `import-x/order` (groups + newlines +
   alphabetize). One owner for import order: ESLint, with autofix.
4. **`naming-convention` carve-outs** (issue #2 baseline plus): PascalCase
   functions (React components), `format: null` for destructured variables and
   object/type properties (external API payloads: Nominatim `display_name`, USFS
   `LATITUDE`, HTTP headers, MapLibre style keys).
5. **`platform/` wrappers exempt from `no-unsafe-*`/`no-require-imports`.**
   Conditional `require()` of native modules with mock fallbacks for web/Expo Go
   is the documented architecture of that directory.
6. **`security/detect-object-injection` stays a warning** (per issue #1's own
   config). ~40 warnings remain on validated dynamic-key access; lint gates pass
   on errors only. Tracked in `docs/tech-debt.md`.
7. **ESLint 9, not 10.** `eslint-plugin-react` (≤9.7) and
   `eslint-plugin-react-native-a11y` (eslintrc-era, wrapped with
   `@eslint/compat`) don't yet support 10.
8. **Semgrep runs at pre-push/CI, not lint-staged** — per-commit latency would
   be seconds-to-minutes per file batch. **`tsc-files` is not used**: per-file
   typechecking can't honor seven different workspace tsconfigs;
   `turbo typecheck` at pre-push is correct and cached instead.
