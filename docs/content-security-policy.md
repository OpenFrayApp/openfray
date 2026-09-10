# Content Security Policy

`cloudflare/_headers` owns the response policy for the assembled deployment. The assembly script overwrites any header file copied from a submodule. This keeps one policy across the website, console, handbook, player view, and published shares.

The policy permits the same-origin build assets, Supabase connections, Fathom analytics, Cloudflare Web Analytics, and the Turnstile report challenge. All other script, style, connection, frame, image, font, media, worker, and object sources are blocked by default.

## Diagnostics

Browsers send violations to `/api/csp-reports`. The Function accepts only bounded `application/csp-report` requests. It retains these fixed fields:

- The effective directive.
- The enforcement disposition.
- The response status code.
- A coarse resource class such as `https`, `data`, or `inline`.

The Function discards document addresses, blocked addresses, source files, script samples, unknown fields, and network identifiers. Diagnostics must never include authored content, account identifiers, capability codes, credentials, tokens, or full URLs.

## Release evidence

`release-evidence/csp-report-only.json` records the reviewed report-only result for the exact policy file hash. It names the required path classes and staged violation classes with fixed identifiers. The release verifier fails when this evidence is missing, incomplete, or tied to another policy hash.

Run these checks before deployment:

1. Run `npm test` to exercise allowed routes, blocked resource classes, report redaction, and assembly.
2. Run `npm run build` to assemble the deployment.
3. Run `wrangler pages dev dist` and inspect the output for rejected header or redirect rules.
4. Run `npm run verify:release` from a clean workspace.
5. Confirm that the manifest records hashes for `cloudflare/_headers`, `release-evidence/csp-report-only.json`, and both reporting boundary source files.

A policy change invalidates the report-only evidence. Exercise the changed policy in report-only mode on staging. Review every required path and staged violation class before recording the new hash and restoring enforcement.

## Rollback

If enforcement breaks a required path, change `Content-Security-Policy` to `Content-Security-Policy-Report-Only` in `cloudflare/_headers` and redeploy the last safe directives. Keep `report-uri /api/csp-reports` and the report Function unchanged. The release verifier will fail while enforcement is disabled or the evidence hash differs.
