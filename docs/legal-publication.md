# Send policy and security emails manually

Terms, Privacy, combined policy updates, and case-by-case security notices are
manual messages in Resend. Prepare full templates there, review the content and
exact recipient selection, then send deliberately. There is no post-deployment
legal registration job and no Cloudflare API token or legal baseline setup to
complete for this workflow.

## Ownership and activation

Automatic account messages are signup welcomes and authenticated account-deletion
confirmations. Manual service notices are Terms, Privacy, combined policy updates,
and case-by-case security messages.

The console owns account events, authenticated erasure, and the shared database
migration lineage. Admin owns delivery functions and reviewed email templates.
The parent owns the assembled console, site, and handbook deployment; the admin
dashboard deploys independently.

Source merge, service deployment, and delivery activation are separate actions.
A source merge does not apply database migrations, deploy mail functions, or
activate sending. Each production action requires separate authorization.

## Automatic account messages

Only signup welcomes and authenticated account-deletion confirmations are wired
into the app. In normal staging testing, these go to the account's registered
address and retain the `[Staging]` subject prefix. The staging account worker runs
once per minute for queued welcomes; deletion confirmation follows authenticated
erasure directly. The controlled-inbox smoke option remains available for these checks.
Normal staging routing is bound to its own Supabase project, never its production parent.
Follow the console’s
[verification procedure](https://github.com/OpenFrayApp/console/blob/develop/docs/account-email-verification.md)
and admin’s
[account email guide](https://github.com/OpenFrayApp/admin/blob/main/docs/account-email.md)
for deployment and recovery. The admin repository requires maintainer access.
Production configuration and release require separate approval.

## Manual service notices

For manual staging messages, select only staging accounts. Sending in Resend does
not use the app worker's recipient override, so review the actual To addresses
before confirming. Avoid creating a marketing contact or newsletter workflow for
these service messages.

The site still publishes its Terms and Privacy dates and public metadata. Changing
those dates neither authorizes nor triggers sending. Existing database publication,
notified-version, and uncertain-attempt history must remain intact; do not delete
or rewrite it as part of adopting manual sends. The retained registration code is
inactive, with `LEGAL_PUBLICATION_ENABLED=false`; it is not a setup requirement.

Older legal and security sending paths remain in source and the database.
Manual delivery describes the configured workflow, not removal of every sending
capability. Keep registration disabled and review restored or pending work before
resuming a worker. Recovery must preserve uncertain attempts and publication history.
