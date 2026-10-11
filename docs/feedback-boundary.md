# Console feedback boundary

`POST /api/feedback` accepts feedback from the console without requiring an account.
The console owns the shared contract in `console/src/feedback/index.ts`.
`feedback-boundary/feedback.ts` owns validation, verification, and delivery.

## Routing

Ordinary categories create public issues in `OpenFrayApp/console`. Each issue receives
`needs-triage`; bugs also receive `bug`, and feature requests receive `enhancement`.
Every issue is assigned to `SirDarcanos`. Category is included in the body.
Release-impact and readiness labels remain maintainer decisions.

Issue creation precedes separate label and assignment requests. Confirmed creation remains
successful if metadata fails. Diagnostics name only the failed metadata operation.

A failed or uncertain creation attempts email through Resend to `reports@openfray.app`.
Possible GitHub/email duplicates are accepted. There is no reconciliation queue or durable
report store. **Security** goes directly to email and never calls GitHub.

## Configure delivery

Configure these values separately in Pages Preview and Production:

| Value                          | Purpose                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `VITE_TURNSTILE_SITE_KEY`      | Public challenge key included in the console build                      |
| `TURNSTILE_SECRET_KEY`         | Server-only verification secret                                         |
| `FEEDBACK_ALLOWED_HOSTS`       | Comma-separated allowed Turnstile hostnames, without schemes or paths   |
| `FEEDBACK_GITHUB_TOKEN`        | Server-only credential restricted to console issue write access         |
| `RESEND_API_KEY`               | Server-only sending credential restricted to the verified sender domain |
| `FEEDBACK_EMAIL_FROM`          | Verified sender address, optionally with an OpenFray display name       |
| `PUBLIC_ROUTE_FINGERPRINT_KEY` | Environment-specific secret for opaque network rate-limit keys          |
| `PUBLIC_ROUTE_RATE_LIMITER`    | Pages service binding to the public-route limiter Worker                |

Deploy `rate-limit-worker/wrangler.jsonc` with its new `FEEDBACK_RATE_LIMIT` binding before
activating the endpoint. Namespace `1005` allows five requests per minute per network key.
Missing rate-limit configuration rejects delivery. Missing challenge configuration also
rejects delivery. Missing GitHub credentials use email fallback after verification.

Create a GitHub fine-grained token with **Issues: Read and write** for `OpenFrayApp/console`.
Confirm that `SirDarcanos` can be assigned and that `needs-triage`, `bug`, and `enhancement`
exist. Store the token only as a Pages secret. Do not reuse a developer CLI token.

Verify the exact sender domain in Resend. Configure SPF, DKIM, and DMARC, and disable
open and click tracking for sensitive notifications. The recipient is fixed in source;
submitted fields cannot choose recipients, senders, headers, repository, or assignees.
Messages use plain text. No reporter email or reply address is collected.

## Bounds and privacy

Title is a nonblank single line of at most 256 characters. Description is nonblank and
limited to 5,000 characters. Bugs may include 2,000 characters of expected behavior.
The request ceiling is 40 KiB, including JSON and the challenge token.
Unknown fields are discarded. Expected behavior and technical details are discarded for
all non-bug categories, including Security.

Bug diagnostics are opt-in. They contain bounded browser and operating-system labels,
viewport dimensions, and creature, player-character, and quick-add nonplayer-character counts.
They contain no console version, raw user agent, account identifiers, URLs, creature names,
stats, notes, or game log. The submitted snapshot matches the visible preview.

Rate limiting runs before challenge verification. Turnstile must return success for action
`report` and an explicitly allowed hostname. Rejected or unverifiable submissions never
invoke either delivery provider. No request content or provider error body is logged.
Responses are uncached and carry an opaque request identifier.

The route has a 15-second budget. Verification gets at most three seconds; issue creation
gets four; parallel metadata updates get two; email gets five. Provider response bodies
are bounded. The client stops waiting after 20 seconds and preserves an unconfirmed draft.

## Verify before activation

Use synthetic reports without private information:

1. Run typechecking and the feedback-boundary and public-rate-limit tests.
2. Build the assembled site and run `wrangler pages dev dist` with local service bindings.
3. Confirm routing has no infinite redirect loop and non-POST requests are rejected.
4. Submit an ordinary report. Confirm its title, body, labels, assignee, and returned issue link.
5. Make GitHub unavailable and confirm Resend accepts a fallback message.
6. Submit Security. Confirm private email acceptance and no GitHub issue or request.
7. Make both providers unavailable. Confirm the draft remains and the console offers recovery.
8. Reject verification and exceed the rate limit. Confirm neither provider receives a report.

Email success means provider acceptance, not confirmed mailbox delivery. Security failures
offer direct email and never public GitHub reporting. Credentials and live delivery still
require deployment configuration; mocked automated tests do not prove that configuration.
