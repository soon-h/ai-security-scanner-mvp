# Issue Tracker: Local Markdown

Issues live as files under `.scratch/` in this repository.

## Structure

```
.scratch/
├── feature-name/
│   └── issue.md
├── bug-name/
│   └── issue.md
└── ...
```

## Issue format

Each `.scratch/<name>/issue.md` is a markdown file with YAML frontmatter:

```yaml
---
title: "Issue title"
status: needs-triage  # or: needs-info, ready-for-agent, ready-for-human, wontfix
priority: high        # optional: high, medium, low
assignee: null        # optional
---

## Description

Issue content here.
```

## Workflow

1. Create a new `.scratch/<name>/issue.md` with `status: needs-triage`
2. Maintainer evaluates and updates status
3. Once `ready-for-agent`, agent can pick it up with no human context
4. Human implementation when marked `ready-for-human`
5. Mark `wontfix` if not actionable

## Tips

- Use descriptive `<name>` directories (e.g., `.scratch/add-caching/`)
- Attach related files or code samples alongside `issue.md`
- Update status and notes as context changes
