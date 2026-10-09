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

Configure the Pages Functions values from [the report boundary guide](./report-boundary.md)
and [the public route boundary guide](./public-route-boundary.md) in both environments.
Each environment uses its own Supabase project, Turnstile keys, report keys, and
public-route fingerprint key.

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
