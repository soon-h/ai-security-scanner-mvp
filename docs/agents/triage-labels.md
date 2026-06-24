# Triage Labels

The five canonical triage states:

| Label | Meaning |
|-------|---------|
| `needs-triage` | Maintainer needs to evaluate and assess |
| `needs-info` | Waiting on reporter for clarification |
| `ready-for-agent` | Fully specified; AFK agent can pick up with no human context |
| `ready-for-human` | Needs human implementation or review |
| `wontfix` | Will not be actioned |

These are applied as YAML `status:` fields in `.scratch/<name>/issue.md` files.
