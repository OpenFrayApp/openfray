# Public route boundary

The public share, image, anonymous-report, and CSP-report routes use the controls in `public-boundary/route.ts`. Every route has an independent fixed-window threshold. The table lists the configured Cloudflare threshold.

| Route            |               Threshold |  Deadline |               Request ceiling |                                          Upstream or output ceiling |
| ---------------- | ----------------------: | --------: | ----------------------------: | ------------------------------------------------------------------: |
| Share HTML       | 120 requests per minute | 2 seconds | URL and capability validation |                                            64 KiB per JSON response |
| Share image      |  30 requests per minute | 4 seconds | URL and capability validation |                              1 MiB rendered image; 512 KiB per font |
| Anonymous report |  10 requests per minute | 5 seconds |                         4 KiB | 64 KiB share response; smaller verification and insertion responses |
| CSP report       |  60 requests per minute |  1 second |                         4 KiB |                                                No upstream response |

Pages derives an opaque network key with `PUBLIC_ROUTE_FINGERPRINT_KEY`. The private `PUBLIC_ROUTE_RATE_LIMITER` service binding sends that key to `rate-limit-worker/index.ts`. The Worker applies the four native Cloudflare counters in `rate-limit-worker/wrangler.jsonc`.

A missing service binding or fingerprint key rejects public work. Unit tests use the bounded in-memory implementation. Supabase still enforces strict per-share, network, and duplicate quotas for anonymous reports.

## Configure Cloudflare

1. Deploy `rate-limit-worker/wrangler.jsonc` with `npx wrangler deploy --config rate-limit-worker/wrangler.jsonc`.
2. Add a Pages service binding named `PUBLIC_ROUTE_RATE_LIMITER`. Select the `openfray-public-route-limiter` Worker.
3. Add `PUBLIC_ROUTE_FINGERPRINT_KEY` as a Pages secret. Use a separate random value in each environment.
4. Repeat the service binding and secret for preview deployments used in staging exercises.

Keep each native namespace identifier stable after deployment. Changing one resets that route’s counters.

Cloudflare’s native counters are permissive and eventually consistent. A short burst can exceed the configured threshold before requests receive HTTP 429. Treat each value as a coarse abuse control and verify it with a bounded safety cap.

Share HTML and image cache keys lowercase the capability path and remove the query and fragment. The request URL still reaches the console unchanged when the route serves the generic shell.

## Status and diagnostics

Bounded failures use these statuses:

| Condition                                    | Status |
| -------------------------------------------- | -----: |
| Invalid request                              |    400 |
| Missing or unpublished share                 |    404 |
| Route threshold reached                      |    429 |
| Dependency unavailable or response too large |    503 |
| Route deadline reached                       |    504 |

Every response carries an opaque `x-request-id`. Failure diagnostics contain only that identifier, the fixed route name, and the fixed outcome. They exclude URLs, share capabilities, network addresses, account identifiers, and authored content.

## Verify locally

1. Run `npm run build`.
2. Start the rate-limit Worker and Pages Functions with local bindings that match the names above.
3. Start `wrangler pages dev dist` and inspect its routing output.
4. Request `/s/not-a-code` and `/s/not-a-code/og.png`. Expect HTTP 400 with the generic shell or image.
5. Send more requests than each route threshold from one local client. Expect the exact threshold from the in-memory local limiter.
6. Stop the configured Supabase endpoint or use an unreachable local value. Expect HTTP 503 within the listed route deadline.
7. Point the endpoint at a server that accepts a connection without answering. Expect HTTP 504 within the listed route deadline.
8. Add different query strings and capability letter casing to an authorized synthetic share. Inspect the cache and confirm one normalized key per HTML or image path.
9. Inspect the Pages output. Confirm each failure record has only `kind`, `requestId`, `route`, and `outcome`.
10. Confirm Wrangler reports no infinite redirect loop.

Use synthetic capabilities and content in local checks. Do not copy local request values into an evidence artifact.

## Exercise staging

Use the authorized staging identity and synthetic content with no private or authored values. Repeat the local checks against staging. Set a safety cap above each configured threshold and stop at the first HTTP 429. A result passes when limiting starts before the cap.

Record the status, elapsed-time class, route, safety cap, deployed commits, approver, and timestamp. Record threshold counts as ranges when concurrent traffic affects the exact request number.

Exclude URLs, share capabilities, network addresses, request bodies, account identifiers, credentials, provider responses, and raw diagnostic output. The staging exercise supplements the automated route, cache-property, timeout, payload, and redaction tests.

## Staged evidence

The authorized Preview exercise on 11 September 2026 used synthetic request values at commit `4765b0c`. `release-evidence/public-route-boundary.json` contains the bounded results.

All four routes returned HTTP 429 before their safety caps. Share HTML first returned 429 by request 213 of 300. Share image did so by request 51 of 80. Anonymous report did so by request 20 of 30. CSP report did so by request 103 of 150. Admitted anonymous-report requests returned 503 because Preview did not contain the complete report-boundary configuration.

A temporary stalling dependency exercised both share deadlines. Share HTML returned 504 in 2,262 milliseconds. Share image returned 504 in 4,177 milliseconds. Both responses carried a valid opaque request identifier.

The unprefixed Preview overrides were removed after the exercise. A restoration deployment returned 404 for synthetic missing shares in 767 milliseconds and images in 234 milliseconds. Both responses carried a valid opaque request identifier. The temporary dependency was then deleted.

## Roll back

Disable the affected public operation at the Pages boundary or serve its generic fallback. Keep share revocation and unpublish operations available. Keep the anonymous-report database boundary and its accepted rows.
