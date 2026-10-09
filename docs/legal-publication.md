# Send policy and security emails manually

Terms, Privacy, combined policy updates, and case-by-case security notices are
manual messages in Resend. Prepare full templates there, review the content and
exact recipient selection, then send deliberately. There is no post-deployment
legal registration job and no Cloudflare API token or legal baseline setup to
complete for this workflow.

Only signup welcomes and authenticated account-deletion confirmations are wired
into the app. In normal staging testing, these go to the account's registered
address and retain the `[Staging]` subject prefix. The staging account worker runs
once per minute for queued welcomes; deletion confirmation follows authenticated
erasure directly. Production configuration and release require separate approval.

For manual staging messages, select only staging accounts. Sending in Resend does
not use the app worker's recipient override, so review the actual To addresses
before confirming. Avoid creating a marketing contact or newsletter workflow for
these service messages.

The site still publishes its Terms and Privacy dates and public metadata. Changing
those dates does not automatically send mail. Existing database publication,
notified-version, and uncertain-attempt history must remain intact; do not delete
or rewrite it as part of adopting manual sends. The retained registration code is
inactive, with `LEGAL_PUBLICATION_ENABLED=false`; it is not a setup requirement.

The controlled-inbox smoke option remains available for welcome/deletion checks.
Normal staging uses explicit registered-recipient routing bound to its own
Supabase project, never its production parent.
