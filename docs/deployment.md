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

1. Merge component changes into their repository's `main` branch.
2. Run `npm run release` from a short-lived branch in this repository.
3. Open its pull request against `develop`.
4. Merge the pull request and verify the `develop` Preview deployment.
5. Open a pull request from `develop` to `main`.
6. Merge it to deploy production.

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
