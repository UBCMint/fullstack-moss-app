# CI gates and PR automation

## `workflows/code-quality.yml`

Runs on all pull requests and pushes to `main`, with no path filter. A newer run
cancels the previous run for the same workflow/ref. Four independent jobs run:

| Job | Gate |
| --- | --- |
| `rustfmt` | Stable Rust; `cargo fmt --all -- --check` from `backend/`. |
| `clippy` | Stable Rust; `SQLX_OFFLINE=true`; `cargo clippy --workspace --all-targets -- -D warnings`. Uses checked-in `backend/.sqlx` query metadata. Installs Python development/native build dependencies and patches the fetched `lsl-sys` vendored Boost `PTHREAD_STACK_MIN` preprocessor check before compiling on Ubuntu. |
| `ruff (format + check)` | Python `3.x`, Ruff pinned to `0.8.4`; `ruff format --check .` and `ruff check .` from the repository root. Does not install/run the ML stack. |
| `frontend lint + typecheck` | Node 20; `npm ci`, `npx eslint .`, `npx tsc --noEmit`, `npx prettier --check .` from `frontend/`. ESLint warnings are not explicitly made fatal with `--max-warnings=0`. |

No workflow currently runs `cargo test`, Python tests, a Next.js production
build, Docker builds, or inference against model checkpoints. Clippy compiling
all targets is not execution of the test suite. Container builds use Rust 1.88
and the frontend image uses Node 22, unlike CI's stable Rust and Node 20.

## `workflows/pr-workflow.yml`

Runs on PR `opened`, `synchronize`, and `ready_for_review` events. The automation
script skips drafts, assigns the author, manages path labels and requests
reviewers:

| Changed path | Label | Lead reviewers |
| --- | --- | --- |
| `frontend/` | `frontend` | `xshauryaa` |
| `backend/` | `backend` | `xshauryaa` |
| `.github/` | `infra` | `xshauryaa` |

`PR Check` updates one marked approval-status comment and fails unless at least
one lead from the combined applicable rules has approved, or two configured
team members other than the author have approved. All team lists are currently
empty, so only the lead route is available. It does not require a separate lead
approval for every changed area.

Implementation limits to keep in mind:

- Root-only edits (for example `README.md`, `CLAUDE.md`, or `docker-compose.yml`)
  match no path rule; the approval condition then cannot pass.
- Review submissions/dismissals are not triggers, so an approval alone does not
  automatically rerun this check.
- The script collects returned reviews with state `APPROVED`; it does not
  explicitly reduce them to the latest review per user or paginate the list.
- Workflow failure blocks merging only if repository branch protection/rulesets
  require the check; those settings are not defined by these YAML files.

These describe the current workflow, not changes to review policy.
