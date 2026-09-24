# Release evidence sources

`release-evidence/sources.json` is the reviewed registry for environment, provider, and physical-device evidence. The release verifier validates and fingerprints this registry before using it.

## Environment identities

The registry uses logical identities that contain no provider project reference, URL, account name, or credential. Local, staging, and production have distinct identities. The maintainer owns each identity and authorizes its use.

The local identity permits local checks only. The staging identity permits checks against the authorized staging environment. A check must confirm that identity before collecting provider-backed evidence.

Production checks require separate written authorization before any request is sent. Release approval does not grant probing authorization. The authorization must name the target, scope, collector, time window, and approving maintainer. Keep the authorization outside evidence artifacts when it contains private provider or account details. Record only an approved bounded reference when a future production collector defines one.

## Provider baselines

Each provider record names its authority, collection method, unsupported manual checks, availability, and freshness rule. A source-file authority is reviewed in Git. A provider-dashboard authority requires a manual comparison against the provider's current settings.

The verifier fingerprints each validated provider record. A source-file baseline also includes the fingerprint of its exact authority file. Dashboard access is recorded as unavailable until access and a collection procedure are confirmed. An unavailable baseline remains in the report and provides no passing provider evidence.

Provider evidence expires after 90 days. It expires immediately when any listed invalidator changes. Collect fresh evidence after a source commit, lockfile, migration head, fixture hash, baseline hash, or environment identity changes.

## Physical-device coverage

The device matrix records the representative browser, operating system, input, and assistive-technology combinations from the hardening specification. Mark a combination available only after the maintainer confirms access to that physical setup. Record unavailable combinations instead of substituting emulation or claiming coverage.

A device result must identify the registry entry and baseline hash. It may record the check identifier, result, time, and approver. It must not include screenshots, typed encounter content, account identifiers, share capabilities, full URLs, or raw rejected values.

## Collection procedure

1. Start from a clean workspace at the commits recorded by the verifier.
2. Select the logical environment identity before opening any provider or device collector.
3. Confirm the provider authority and the registry entry's availability.
4. Obtain separate written authorization before a production probe.
5. Run only the documented collection method. Record unsupported checks as manual or not measured.
6. Save bounded results through the release verifier. Never copy provider output directly into an evidence artifact.
7. Review the manifest and report for private data before approval.

Evidence may contain stable identifiers, hashes, fixed result states, commands, timestamps, and an approver field. It must exclude authored content, account identifiers, capability codes, credentials, secrets, full URLs, and raw rejected values.
