# Collaboration Guide

Git workflow and PR etiquette for this repo. Everyone working on `fullstack-moss-app` follows this.

## Branch naming

Standard conventional-commits-style prefixes, one per branch:

```
<type>/<team>/<description>-<your_name>
```

Where:
1. `<type>` is one of:
- `feat` — new functionality
- `fix` — bug fix
- `refactor` — code change that isn't a feature or a fix (restructuring, renaming, simplifying)
- `chore` — cleanup, dependency bumps, tooling, config, anything non-functional
- `docs` — documentation only
- `test` — adding or fixing tests only

2. `<team>` is one of:
- `FE` - frontend (touches only frontend code)
- `BE` - backend (touches only backend code)
- `FS` - full stack (touches both frontend and backend)

Examples:
```
feat/BE/session-export-costas
fix/FE/login-redirect-ruther
refactor/BE/pipeline-node-config-pawan
chore/FE/update-eslint-config-ruther
docs/FS/api-reference-shaurya
```

Keep `<description>` and `<your-name>` lowercase, hyphen-separated, and short enough to read at a glance (3-5 words max). 

## Commit messages

- Write in the imperative ("add session export endpoint", not "added" or "adds").
- Keep the summary line under ~70 characters; add detail in the body if the change needs explaining.
- Reference the GitHub issue or Notion task if one exists.

## Pull requests

- One PR per branch, scoped to the area named in the branch. Don't bundle unrelated frontend and backend changes into one `FE`/`BE` branch — use `FS` if a change genuinely needs both.
- PR title references the GitHub Issue or Notion task, e.g. `steve/[Bug Fix] Changed color of background`.
- Use the existing PR template (`.github/PULL_REQUEST_TEMPLATE.md`) — fill in **What?**, **How?**, and **Testing**, with screenshots or recordings for UI changes.
- Keep PRs small and short-lived. A PR open for weeks accumulates merge conflicts and gets harder to review.
- Rebase (or merge `main` in) before opening the PR if your branch is behind, so CI and reviewers see the real diff.
- Draft PRs are fine for early feedback — mark them non-draft (`ready_for_review`) once you actually want review and the CI/labeling automation to run.

## Review and merge rules (enforced automatically)

- `.github/workflows/pr-workflow.yml` labels PRs by path (`frontend`, `backend`, `infra`) and requires either 1 lead approval or 2 team-member approvals before merge — see `.github/CODEOWNERS` for current leads per area.
- `.github/workflows/code-quality.yml` gates every PR on `cargo fmt`, `cargo clippy -D warnings`, `ruff format`/`ruff check`, and frontend `eslint`/`tsc --noEmit`/`prettier --check`. Run the relevant checks locally before pushing so you're not waiting on CI to find a formatting issue.
- Don't merge your own PR without the required approvals, even if CI is green.

## General etiquette

- Delete your branch after it's merged (GitHub can do this automatically on merge — turn that on in repo settings if it isn't already).
- Don't force-push to a branch other people have pulled or are reviewing, without telling them first.
- Never force-push to `main`.
- If you discover unrelated work-in-progress on a branch (someone else's uncommitted changes, an unfamiliar branch), ask before touching it — don't assume it's safe to overwrite or delete.
- Resolve merge conflicts in your own branch by rebasing or merging `main` in; don't ask a reviewer to resolve them for you.
- If CI fails, fix the underlying issue — don't skip hooks or push with `--no-verify`.

## Pull request template

The current template lives at `.github/PULL_REQUEST_TEMPLATE.md` (and is mirrored at `frontend/.github/pull_request_template.md`). Keep both in sync if it's edited. Contents:

```markdown
## What?

**Add a concise description** of the change made.

**Example:** "Implemented backend API for dataset retrieval."

---

## How?

**Mention a brief technical explanation** of the change.

**Example:** "Refactored the API service to handle dataset retrieval with
caching to improve performance."

---

## Testing

List ways you have tested the code.

**Example:** "Used console.log() to ensure function ran, UI changes color when
hovering over"

Attach images or videos if possible.

---

### Notes:

- This template is intended to **guide** your PR submission, but feel free to
  modify sections as needed.
- For the PR title, just reference the appropriate Github Issue/Notion Task
  - eg. `steve/[Bug Fix] Changed color of background`
```
