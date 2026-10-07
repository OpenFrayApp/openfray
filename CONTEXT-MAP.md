# OpenFray context map

Read the public documentation relevant to the work. The console has a dedicated
domain model; other contexts document their scope and contracts in the files below.

| Context                                | Repository               | Public documentation                                                                                                                                   |
| -------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deployment and shared configuration    | `OpenFrayApp/openfray`   | [AGENTS.md](./AGENTS.md), [Deployment](./docs/deployment.md)                                                                                           |
| Combat console                         | `OpenFrayApp/console`    | [CONTEXT.md](./console/CONTEXT.md), [AGENTS.md](./console/AGENTS.md)                                                                                   |
| Marketing site and published libraries | `OpenFrayApp/site`       | [AGENTS.md](./site/AGENTS.md), [README.md](./site/README.md)                                                                                           |
| Handbook                               | `OpenFrayApp/docs`       | [AGENTS.md](./handbook/AGENTS.md), [README.md](./handbook/README.md)                                                                                   |
| Browser importer                       | `OpenFrayApp/importer`   | [AGENTS.md](https://github.com/OpenFrayApp/importer/blob/main/AGENTS.md), [README.md](https://github.com/OpenFrayApp/importer/blob/main/README.md)     |
| Compendium ingest tooling              | `OpenFrayApp/compendium` | [AGENTS.md](https://github.com/OpenFrayApp/compendium/blob/main/AGENTS.md), [README.md](https://github.com/OpenFrayApp/compendium/blob/main/README.md) |

## Relationships

- Console, site, and handbook produce builds assembled by the deployment workspace.
- Compendium generates reference JSON shipped by the console.
- Importer produces creature data for the console to import.
- Handbook documents console behavior. Relevant console changes require matching
  handbook and screenshot changes.
- Site reads console stat-block data when rendering published libraries.

Read existing ADRs when they affect the work. Add domain documents when new
terminology needs a stable definition. Contributor work does not require private
marketing context or maintainer notes.

See [Repository file policy](./docs/development/repository-files.md) for the
publication boundary and [Content licensing](./docs/development/content-licensing.md)
for ingestion requirements.
