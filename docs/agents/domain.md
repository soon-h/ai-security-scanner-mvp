# Domain Docs

This project uses a **single-context** layout.

## Structure

- **`CONTEXT.md`** (repo root) — Domain language, patterns, key concepts
- **`docs/adr/`** — Architecture decision records

## How skills use these

- `/improve-codebase-architecture` reads `CONTEXT.md` to understand domain
- `/diagnosing-bugs` consults `CONTEXT.md` for domain context
- `/tdd` and design-related skills read past ADRs to respect decisions

## Setup

Create `CONTEXT.md` at the repo root and document:
- What this project does
- Key domain concepts and terminology
- Architectural patterns in use
- Constraints or non-obvious design choices

Add architectural decisions to `docs/adr/` as you make them (ADR-0001, ADR-0002, etc.).
