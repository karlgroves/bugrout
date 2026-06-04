# ADR 0005: No Express hardening stack (helmet, express-rate-limit, etc.)

- Status: Accepted
- Date: 2026-06-04
- Context: Issue #1 (Express backend specifics)

## Context

Issue #1 prescribes `helmet`, `express-rate-limit`, `cors`, `express-slow-down`,
`pino`, `zod`+`zod-to-openapi`, and `envalid` for an Express backend. This repo
has no Express: the backend is three Cloudflare Workers and one raw `node:http`
Fly.io service (route-tracker).

## Decision

Do not introduce Express or its middleware stack. Keep the existing hand-rolled
hardening, which already covers the same ground:

- route-tracker: security headers, allowlist CORS, in-memory rate limiting,
  bearer auth with constant-time comparison, body-size caps, strict input
  validation patterns.
- Workers: platform-managed TLS/headers; input validation in handlers;
  `eslint-plugin-security` + Semgrep (`p/owasp-top-ten`) lint both surfaces.

## Consequences

- If the backend grows beyond a single-file service, adopt zod for request
  validation and pino for structured logging at that point (they are
  runtime-agnostic and still recommended); revisit this ADR.
