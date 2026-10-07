# Repository file policy

Commit the files a contributor needs to understand, build, test, and modify OpenFray.

## Public project knowledge

Keep these files in version control:

- READMEs, contribution rules, `AGENTS.md`, and writing style guides.
- Architecture, domain terminology, security contracts, and relevant decisions.
- Source code, tests, migrations, CI, dependency lockfiles, and sanitized environment examples.
- Content licenses, attribution, and ingestion procedures.
- Screenshot recipes, print checks, and other reproducible developer workflows.
- Assets and vetted datasets consumed by shipped builds.

Generated compendium JSON is committed in the console because the console and site
consume it without running the ingestion toolchain. Intermediate compendium
`output/` remains ignored.

## Private and generated files

Each repository ignores credentials, local environment files, authenticated browser
sessions, agent state, local notes, dependencies, caches, and test artifacts.

Keep private marketing plans and research under `docs/marketing/`, which is ignored.
Contributor setup and product constraints belong in public docs and must remain
usable without that folder.

Local marketing skills expect `.agents/product-marketing.md`. A maintainer may
create an ignored symlink there to `docs/marketing/product-marketing.md`.
Related compatibility paths for loops, advisors, and listening sources are ignored too.
These links and private files are optional and are not part of a contributor checkout.

Keep useful shared agent workflows public when they document reproducible project
work. Ignore personal tool state by its specific path.

## Review before committing

Check `git status` and the staged diff. Use `git check-ignore -v <path>` to verify
a private file's rule.

Ignore rules do not remove files already tracked. Untrack private files explicitly
while retaining the local copy. Earlier committed versions remain in Git history.

Use placeholders in environment examples. Keep credentials, account exports,
database dumps, and live session files out of commits and review attachments.
