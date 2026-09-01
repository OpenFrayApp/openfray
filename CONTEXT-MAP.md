# OpenFray context map

Read the context documents relevant to the work. Missing documents require no warning.

| Context                                | Repository               | Context document                                                 |
| -------------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| Deployment and shared configuration    | `OpenFrayApp/openfray`   | [`CONTEXT.md`](./CONTEXT.md)                                     |
| Combat console                         | `OpenFrayApp/console`    | [`console/CONTEXT.md`](./console/CONTEXT.md)                     |
| Marketing site and published libraries | `OpenFrayApp/site`       | [`site/CONTEXT.md`](./site/CONTEXT.md)                           |
| Handbook                               | `OpenFrayApp/docs`       | [`handbook/CONTEXT.md`](./handbook/CONTEXT.md)                   |
| Browser importer                       | `OpenFrayApp/importer`   | `https://github.com/OpenFrayApp/importer/blob/main/CONTEXT.md`   |
| Compendium ingest tooling              | `OpenFrayApp/compendium` | `https://github.com/OpenFrayApp/compendium/blob/main/CONTEXT.md` |

## Relationships

- **Console, site, and handbook → deployment**: each produces a build that the deployment workspace assembles into one site.
- **Compendium → console**: the compendium generates the reference JSON shipped by the console.
- **Importer → console**: the importer produces OpenFray creature data for the console to import.
- **Console → handbook**: the handbook documents console behavior, labels, and workflows. Relevant console changes require matching handbook and screenshot changes.
- **Console → site**: the site reads console stat-block data when rendering published libraries.
