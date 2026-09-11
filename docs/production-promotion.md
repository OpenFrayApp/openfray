# Production promotion

Production deploys run through `.github/workflows/production-promotion.yml`. Configure the GitHub `production` environment with required maintainer reviewers. Store the Cloudflare credentials and the fixed production identity in that environment.

Set the Cloudflare Pages production branch to `production`. Do not push source commits to that branch. The protected workflow uploads the approved candidate to that deployment branch after its gate passes.

Configure required maintainer reviewers on the `staging`, `staging-attestation`, and `production` GitHub environments. Prevent self-review when the repository plan supports it. The workflows read the actual reviewer from GitHub's workflow approval history.

Configure these protected environment values:

| Environment           | Value                                | Purpose                                                  |
| --------------------- | ------------------------------------ | -------------------------------------------------------- |
| `staging`             | `CLOUDFLARE_ACCOUNT_ID` secret       | Owns the Pages project.                                  |
| `staging`             | `CLOUDFLARE_API_TOKEN` secret        | Permits the staging upload.                              |
| `staging`             | `CLOUDFLARE_PAGES_PROJECT` variable  | Selects the Pages project.                               |
| `staging-attestation` | `STAGING_ENVIRONMENT_ID` variable    | Identifies the authorized staging target.                |
| `production`          | `CLOUDFLARE_ACCOUNT_ID` secret       | Owns the Pages project.                                  |
| `production`          | `CLOUDFLARE_API_TOKEN` secret        | Permits the production upload.                           |
| `production`          | `CLOUDFLARE_PAGES_PROJECT` variable  | Selects the Pages project.                               |
| `production`          | `PRODUCTION_ENVIRONMENT_ID` variable | Identifies the production target.                        |
| `production`          | `STAGING_ENVIRONMENT_ID` variable    | Names the staging identity that may authorize promotion. |

Use fixed identifiers containing letters, numbers, periods, underscores, or hyphens. Keep provider project references and credentials out of the identifiers.

## Prepare a candidate

Run `npm run release` from a candidate branch. The command updates the component commits, builds the assembled site, commits the candidate, and pushes its branch. It prints the candidate and rollback commits for the staging workflow.

Merge the reviewed candidate before promotion when the release process requires a source pull request. Stage and promote the exact resulting commit. A merge commit has a different identity and needs its own staging attestation.

## Stage a critical candidate

Run `staging-candidate.yml` with the candidate commit and the current production commit as its rollback target. The workflow runs the tests and build, then deploys the exact candidate to the protected staging environment. Its attestation job waits for a separate `staging-attestation` environment review after deployment.

Review the completed staging job before approving its attestation job. Select `passed` only for checks reviewed against that deployment. Select `not-applicable` for other boundaries. Migration changes require passing migration, Row-Level Security, backup health, and rollback results. Authentication and sharing changes require their matching result and the rollback result.

The workflow rejects result selections that disagree with the changed paths. It uploads `staging-release-attestation.json` with these bindings:

- all four coordinated repository commits;
- the authorized staging identity;
- the migration head;
- deployment configuration hashes;
- the staging approver and timestamp;
- the tested coherent rollback commits and migration head.

The attestation expires after seven days. Any candidate, configuration, environment, migration, or rollback mismatch rejects it.

## Promote to production

Run `production-promotion.yml` with the exact candidate and rollback commits. Supply the staging workflow run ID for a release-critical candidate. An ordinary UI or content candidate needs no staging run ID.

The workflow enters the protected `production` environment before reading its credentials. The verifier derives the release class from the root and console diffs. It blocks migration, authentication, Row-Level Security, and sharing changes until matching staging evidence passes.

Every attempt uploads `production-release-manifest`. The record contains the candidate commits, environment identity, migration head, configuration hashes, approver, timestamp, staging evidence hash, and coherent rollback target. Failed attempts retain their failure codes and do not deploy.
