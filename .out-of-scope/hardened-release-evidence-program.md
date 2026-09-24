# Hardened release evidence program

OpenFray does not pursue a separate hardened-release claim or a comprehensive evidence program for ordinary releases. The advisory release verifier maintains a bounded registry of environment identities, provider baselines, and physical-device access.

## Why this is out of scope

The release plan protects the boundaries that can harm everyday use. Database migrations, authentication, Row-Level Security, and sharing changes receive staging checks before production. Automated tests cover the product and deployment contracts owned by the repositories.

A broader program would add recurring provider captures, mandatory physical-device attestations, universal evidence selection, immutable evidence bundles, and separate hardened-release approval. Maintaining that system would take substantial effort without improving the ordinary release decisions OpenFray needs to make.

Performance and accessibility work remain useful when they address observed use. They do not require a separate assurance claim or complete evidence matrix.

## Prior requests

- #5: “Verify expand-and-contract deployment compatibility”
- #6: “Enforce route-specific transfer budgets”
- #9: “Detect security-relevant provider drift”
- #10: “Deliver owned incident signals and runbooks”
- #11: “Make applicable pull-request evidence mandatory”
- #13: “Issue the first hardened-release evidence bundle”
