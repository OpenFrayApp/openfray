# Triage labels

## Workflow labels

| Canonical role    | Tracker label     | Meaning                                 |
| ----------------- | ----------------- | --------------------------------------- |
| `needs-triage`    | `needs-triage`    | Maintainer must evaluate the issue      |
| `needs-info`      | `needs-info`      | Waiting for more information            |
| `ready-for-agent` | `ready-for-agent` | Ready for an autonomous coding agent    |
| `ready-for-human` | `ready-for-human` | Requires human implementation or action |
| `wontfix`         | `wontfix`         | Will not be actioned                    |

## Release-impact labels

| Label   | Meaning                             |
| ------- | ----------------------------------- |
| `patch` | Backward-compatible fix             |
| `minor` | Backward-compatible feature         |
| `major` | Breaking or release-defining change |

Apply at most one release-impact label to an issue.

## Product-area labels

| Label     | Meaning                               |
| --------- | ------------------------------------- |
| `console` | Combat console work                   |
| `site`    | Marketing site or published libraries |
| `docs`    | Handbook work                         |

Apply product-area labels to cross-repo or centrally tracked issues. Issues in an owning subrepository usually do not need them.
