# Activate published legal-date notices

Console issue #111 adds service notices when published Terms or Privacy dates change.
The site owns the visible dates and metadata. The console owns private publication history
and account deliveries. The admin repo owns hosted templates, registration, and sending.
This workspace owns the post-publication job. Builds and assembly send no mail.

## Rollout gates

Keep `LEGAL_PUBLICATION_ENABLED` unset in GitHub and the registration function during preparation.
Keep the production account-mail scheduler disabled. These changes authorize no production send.
Complete the coordinated staging gate in [console#114](https://github.com/OpenFrayApp/console/issues/114) before enabling this flow.

1. Apply the complete console migration lineage to authorized staging. Deploy the admin’s
   `account-mail` and `legal-publication` functions with their documented secret checks.
2. Publish and pin the reviewed Terms, Privacy, and combined templates in staging.
3. Deploy the site metadata and legal copy to staging. Run the staging verification below.
4. Obtain separate production authorization. Apply the migrations, publish the same reviewed
   templates, and configure pinned IDs/revisions before deploying the coordinated release.
5. Deploy the new legal copy and metadata together. Explicitly approve the first baseline:
   enable registration in GitHub and the function, set `LEGAL_BASELINE_APPROVED=true` temporarily,
   and dispatch the workflow with `baseline=true` after successful publication. Keep delivery disabled.
6. Verify the registration result is `baseline` and no legal notices were queued.
   Existing accounts receive no email for this initial policy revision. Remove baseline approval.
7. Enable later production registration and delivery only after recording baseline success.
   Later workflow invocations use `baseline=false`; a missing baseline fails visibly.

The initial baseline records both newly published dates without broadcasting earlier revisions.
This is a deliberate no-history rollout. Do not publish a later changed-date revision before
registration of the current revision succeeds. A superseded revision fails live verification;
review it manually instead of inventing an event for content no longer published.

## Production job

The `legal-publication` workflow runs after pushes to `main`, independently of Pages builds.
It is gated by repository variable `LEGAL_PUBLICATION_ENABLED=true` and the protected
`legal-notices-production` environment. Enable these only with production authorization.
Require maintainer approval on that environment during rollout.

Configure environment values through protected GitHub settings:

- Variables: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT`, and
  `LEGAL_PUBLICATION_FUNCTION_URL` (the production Supabase `legal-publication` function).
- Secrets: `CLOUDFLARE_PAGES_READ_TOKEN` with only Pages Read permission, and
  `LEGAL_PUBLICATION_HOOK_KEY` matching the admin function.

The job waits at most about 20 minutes for Pages. It requires the canonical production
deployment to finish its deploy stage successfully from a clean `main` commit.
It verifies `/legal-publication.json` at `https://openfray.app` against that exact Git revision.
The function verifies the same live metadata again before registering the event atomically.
Publication time comes from the provider’s successful deploy-stage completion time.
Recipients created later than that cutoff receive no historical notice.

Failed, skipped, preview, dirty, pending, mismatched, or stale deployments register nothing.
A failure produces a sanitized job error and needs operator attention. Retry the same workflow
while that revision remains live. Database history makes repeated runs duplicate-safe.
A redeployment or rollback with already recorded dates sends nothing.
Provider acceptance is distinct from delivery; arrival need not coincide with publication.

## Staging verification

Use a separate staging database, an isolated HTTPS staging origin, and one maintainer-confirmed
inbox. Resolve a Supabase `develop` branch to its own project reference before deployment;
never target its production parent. Follow the console’s
[coordinated email verification](https://github.com/OpenFrayApp/console/blob/main/docs/account-email-verification.md)
for the deployment order, staging matrix, pause/rollback procedure, and production gate. Leave the production job disabled throughout this procedure.
Configure the admin function with `ACCOUNT_MAIL_MODE=staging`, `LEGAL_STAGING_ORIGIN`,
`LEGAL_PUBLICATION_ENABLED=true`, and a separate `LEGAL_PUBLICATION_HOOK_KEY`.
Configure the worker’s confirmed test inbox, domain checks, and pinned template revisions.

Run `scripts/legal-publication.mjs` from a protected staging environment. Set
`LEGAL_PUBLICATION_MODE=staging`, `LEGAL_PUBLICATION_APPROVED=staging`, `LEGAL_STAGING_ORIGIN`,
and a staging `LEGAL_PUBLICATION_FUNCTION_URL`. Supply the staging Pages credentials and
`LEGAL_EXPECTED_REVISION` from the successful clean `develop` deployment.
The script verifies the project’s latest preview deployment and staging live metadata.
Choose `LEGAL_BASELINE=true` only for the first approved initialization, then `false`.

1. Establish the explicit baseline and confirm it sends no historical mail.
2. Publish a Terms-only date change and invoke the account worker. Confirm one test-inbox
   email uses the reviewed subject and production Terms link, with no Privacy link.
   Confirm the Terms date remains pinned in publication and eligibility state.
3. Repeat for Privacy-only and simultaneous changed dates. Confirm the combined case sends
   one email with both production links. Confirm both dates remain pinned in publication state.
   The v3 bodies declare no date variables.
4. Verify all links resolve to published production pages. Inspect HTML, derived plain text,
   subject, sender, Reply-To override, signature, and absence of unresolved variables.
5. Repeat registration and delivery concurrently. Confirm one durable event per document/date
   and one provider acceptance per account/publication.
6. Create an account after publication and delete a snapshotted account before delivery.
   Confirm neither receives the historical notice. Exercise the shared worker’s retry gates.
7. Verify content-only edits, redeployment, rollback, failed publication, mismatched revision,
   unauthorized headers, and enabled tracking produce no additional mail.

Record source revisions, baseline result, and pass/fail outcomes without account exports,
addresses, credentials, message bodies, or provider responses. Mocked tests do not satisfy
this deployment verification. Production activation requires that evidence and explicit approval.
