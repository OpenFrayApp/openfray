# Domain docs

Read `CONTEXT-MAP.md` before exploring the project. It identifies the relevant context documentation.

Read ADRs that affect the work:

- `docs/adr/` for workspace-wide decisions
- `<context>/docs/adr/` for context-specific decisions
- The corresponding directories in related external repositories

Missing context files and ADR directories require no warning. The domain-modeling skill creates them when terminology or decisions need recording.

Use terms defined in the relevant `CONTEXT.md`. Flag proposals that conflict with an existing ADR.

## Layout

This project uses a multi-context layout. It covers:

- The OpenFray deployment workspace
- The combat console
- The marketing site and published libraries
- The handbook
- The browser importer
- The compendium ingest tooling

`OpenFrayApp/importer` and `OpenFrayApp/compendium` are separate repositories referenced by the root context map.
