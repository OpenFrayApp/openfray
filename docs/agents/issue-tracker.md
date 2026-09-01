# Issue tracker: GitHub

Issues and specs live in GitHub Issues. Use the `gh` CLI for all operations.

## Issue ownership

Open an issue in the repository that owns the work:

- `OpenFrayApp/console` for the combat console
- `OpenFrayApp/site` for the marketing site and published libraries
- `OpenFrayApp/docs` for the handbook
- `OpenFrayApp/importer` for the browser extension
- `OpenFrayApp/compendium` for compendium ingest tooling
- `OpenFrayApp/openfray` for deployment, shared configuration, releases, and cross-repo work

Use the `console`, `site`, or `docs` label when a centrally tracked issue affects that area.

## Conventions

- Create: `gh issue create --repo OpenFrayApp/<repo> --title "..." --body "..."`
- Read: `gh issue view <number> --repo OpenFrayApp/<repo> --comments`
- List: `gh issue list --repo OpenFrayApp/<repo> --state open`
- Comment: `gh issue comment <number> --repo OpenFrayApp/<repo> --body "..."`
- Label: `gh issue edit <number> --repo OpenFrayApp/<repo> --add-label "..."`
- Close: `gh issue close <number> --repo OpenFrayApp/<repo> --comment "..."`

Infer the repository from the current clone when ownership is clear.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill operations

When a skill says “publish to the issue tracker,” create an issue in the owning repository.

When a skill says “fetch the relevant ticket,” read the issue from its owning repository.
