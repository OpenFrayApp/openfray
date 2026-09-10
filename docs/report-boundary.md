# Anonymous report boundary

`functions/api/reports.ts` is the only public report insertion path. The console posts to `/api/reports`; it never calls the database operation directly.

## Configure an environment

Set these Cloudflare Pages secrets and variables:

| Name                     | Purpose                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `TURNSTILE_SECRET_KEY`   | Verifies the public widget token.                                                         |
| `REPORT_FINGERPRINT_KEY` | Derives unlinkable quota and duplicate keys. Use a separate random value per environment. |
| `REPORT_INGRESS_TOKEN`   | Carries only the Supabase `report_ingress` role.                                          |
| `REPORT_ALLOWED_HOSTS`   | Comma-separated Turnstile hostnames for this deployment.                                  |
| `SUPABASE_URL`           | Names the environment’s Supabase project.                                                 |
| `SUPABASE_ANON_KEY`      | Supplies the public API key for share reads and PostgREST routing.                        |

Set `VITE_TURNSTILE_SITE_KEY` in the console build environment. The public key may ship in the browser. Keep every other value above out of `VITE_` variables.

The ingress token must be signed through the Supabase project’s reviewed signing workflow. Its only database role claim is `report_ingress`. Record its expiry and rotate it before that date. Never place a service-role key in the Pages environment for this route.

## Verify staging

Use only an authorized staging project and Cloudflare’s test site keys. Publish a synthetic share with no private or authored content, then exercise these cases through the deployed route:

1. Submit an invalid challenge. Expect HTTP 403 and no report row.
2. Submit an oversized body. Expect HTTP 413 and no upstream insertion.
3. Submit a valid report. Expect HTTP 201 and one report row.
4. Submit the same report with a fresh valid challenge. Expect HTTP 409 and still one row.
5. Submit six distinct reports from the authorized test network within 1 hour. Expect the sixth to answer HTTP 429.
6. Disable notification delivery and submit one valid report. Expect HTTP 201 and a retained moderation row.
7. Deliver the same database webhook twice. Expect one provider delivery under the same database-event idempotency key.

Record status codes, row counts, environment identity, deployed commits, approver, and timestamp. Exclude share codes, network addresses, challenge values, report content, addresses, credentials, and provider response bodies.

## Roll back

Remove `REPORT_INGRESS_TOKEN` from Pages to make submission answer unavailable. Keep the database migration and accepted rows. Do not grant `report_share()` back to `anon` or `authenticated`.
