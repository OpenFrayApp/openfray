# Deployment

Cloudflare Pages deploys the repository through its Git integration. The branch is
the release control:

| Branch    | Cloudflare environment | Supabase project |
| --------- | ---------------------- | ---------------- |
| `develop` | Preview                | Staging          |
| `main`    | Production             | Production       |

Set `main` as the Pages production branch. Enable automatic production deployments.
Configure Preview branch deployments to include `develop` only.

Use Node 24, `npm run build`, and `dist` in both Cloudflare build environments.
Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
`VITE_TURNSTILE_SITE_KEY` separately for Preview and Production. Use the staging
values for Preview and the production values for Production.

`npm run build` maps the two public Supabase inputs to the site’s
`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` before building any workspace.
Both clients use the same project and key. Do not set independent site values.
Conflicting aliases, incomplete pairs, non-hosted project URLs, and non-public keys stop the build.
Legacy JWT keys must declare the `anon` role and match the project reference when present.
Publishable keys use the `sb_publishable_` prefix; verify their project assignment before building.
This validation does not verify JWT signatures or remote key ownership.
Only `VITE_` public inputs configure authentication; server credentials are never mapping sources.
With neither input, both clients remain unconfigured, including when a workspace has a local `.env`.
Use `npm run build` for assembly; `build:parts` is its internal pipeline.

Configure the Pages Functions values from [the report boundary guide](./report-boundary.md)
and [the public route boundary guide](./public-route-boundary.md) in both environments.
Configure console feedback using [the feedback boundary guide](./feedback-boundary.md).
Each environment uses its own Supabase project, Turnstile keys, report keys, and
public-route fingerprint key.

## Authentication integration

The site serves static `/sign-in/`, `/sign-up/`, and `/auth/callback/` pages.
Pages normalizes their trailing slashes while preserving queries. They need no custom rewrite.
Keep `/_astro/` and `/console/assets/` outside auth rewrites so JavaScript keeps its correct content type.
The console consumes the shared session; the site owns provider initiation and callback completion.
Both use Supabase SDK 2.108.2, its default storage key, persistent sessions, automatic refresh, and implicit flow.
Both disable automatic URL session detection. Only the site validates attempts and installs callback sessions.
Read the [site auth contract](../site/docs/development/authentication.md) for return validation and attempt handling.

Keep #139 unreleased until #140 supplies `/account/`, its direct-entry fallback.
Handbook updates, successful authenticated cross-surface verification, and integrated publication review remain release gates.
These source changes do not enable newsletter subscriptions or authorize provider configuration.

Document the Supabase allowlist before activation. For production, the restricted pattern is
`https://openfray.app/auth/callback/\?attempt=*`.
The escaped question mark matches a literal query separator in Supabase’s glob syntax.
Use the equivalent pattern for each approved staging or assembled preview origin.
Review the [Supabase redirect syntax](https://supabase.com/docs/guides/auth/redirect-urls) before configuring it.
Do not use an origin-wide `/**` allowlist or change provider IDs and verification settings.
No live allowlist change belongs to source verification.

### Same-origin local checks

Separate development origins cannot share browser storage or accept each other’s return destinations.
Use the assembled build for cross-surface checks. Do not proxy the development servers.
Build with mocked public inputs, then start Pages from an empty temporary directory:

```bash
VITE_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co \
VITE_SUPABASE_ANON_KEY=sb_publishable_mock \
VITE_TURNSTILE_SITE_KEY= npm run build

# Run from the repository root. The empty directory prevents loading .dev.vars.
root="$PWD"
preview="$(mktemp -d)"
(cd "$preview" && WRANGLER_SEND_METRICS=false npx wrangler@4.125.0 pages dev "$root/dist" --ip 127.0.0.1 --port 8799)
```

In another terminal at the repository root, run:

```bash
OPENFRAY_PAGES_ORIGIN=http://127.0.0.1:8799 \
npx --no-install vitest run tests/scripts/auth-routing.preview.test.ts
```

Install Playwright Chromium first if absent: `npx --no-install playwright install chromium`.
The preview suite permits only a loopback HTTP origin and blocks browser requests to other origins.
Node HTTP requests follow redirects manually and reject destinations outside the preview origin before requesting them.
Script downloads ignore external analytics references and require at least one local module.
It checks direct visits, slash normalization, query preservation, reloads, script delivery, and a blocked mock provider handoff.
It also checks callback scrubbing, unmatched-attempt failure, enforced CSP, referrer policy, caching, and console worker scope.
Read the Wrangler output for `Infinite loop detected in this rule`.
The suite skips without `OPENFRAY_PAGES_ORIGIN`; ordinary parent tests cover assembly fixtures and environment validation.

This isolated preview serves static assets without Pages Functions or server bindings.
Parent function tests cover their boundaries separately. No live OAuth, Supabase, or email operation is required.
Console tests cover board recovery, cloud separation, and identity renewal; static routing checks do not establish those guarantees.

### Response and offline boundaries

The assembled CSP uses the same public Supabase origin as both browser builds.
Same-origin modules remain allowed; external OAuth uses top-level navigation and needs no new script or connection permissions.
The callback scrubs its URL before loading modules, omits analytics, and supplies a `no-referrer` document policy.
The deployment’s default referrer policy remains `strict-origin-when-cross-origin`.
Only hashed assets receive immutable caching. Static auth HTML contains no session or attempt data.
The console worker is registered at `/console/`; auth routes remain outside its scope and offline shell handling.
No cookie migration, worker scope change, cache expansion, or security-header relaxation is part of this integration.

## Release application changes

1. List the expected companion PRs and merged commit SHAs before assembling the release.
   Include console, site, and handbook; use the current integration commit for an unchanged part.
   Record this list in the release PR so omitted work can be identified during review.
2. Merge console changes into `develop`, and site and handbook changes into `main`.
   These integration branches are explicit in `.gitmodules`.
3. Create a short-lived branch from the latest parent `develop`.
4. Check that the integration tips contain every expected commit:

   ```bash
   npm run release -- --check \
     --expect 'console=<full-merged-commit-sha>' \
     --expect 'site=<full-merged-commit-sha>' \
     --expect 'handbook=<full-merged-commit-sha>'
   ```

   Replace each placeholder with a full 40-character commit SHA. Repeat `--expect`
   for multiple companion commits in one part. For squash merges, use the resulting
   merged commit, not the original feature commit.

5. Run the same command without `--check` to update pins, install, build, commit, and push.
   An optional quoted commit subject follows the expectations.
6. Open its pull request against `develop`. Compare the recorded pins with the
   expected companion list before calling the release complete.
7. Merge the pull request and verify the exact `develop` Preview revision.
8. Only with production approval, open and merge a pull request from `develop` to `main`.

The check fetches component refs and verifies commit ancestry. It leaves pins and
working files unchanged and runs no install, build, commit, or push.
It requires initialized submodules, a clean parent and components, and a short-lived
parent branch. A missing companion commit stops the release before any pin changes.
The ordinary command checks again and pins the verified tips by exact SHA.
Integration tips may include newer commits; review those additions too.
The expected list defines the checked scope; the command does not discover unlisted PRs.

Cloudflare keeps deployment history for rollback. Roll back by selecting the last
working production deployment in the Pages dashboard.

## Release database changes

Run database workflows only when `console/supabase/migrations/` changes.

1. Run the console repository's **Database authority** workflow against staging.
2. Verify the staged console against the staging database.
3. Supply that staging workflow run ID to **Database authority** for production.
4. Run and verify a fresh encrypted production backup.
5. Merge `develop` into `main` after the production database accepts the compatible
   forward migrations.

Keep migrations compatible with the currently deployed console during this sequence.
The scheduled backup and recovery workflows continue without application-deployment
approval steps.
