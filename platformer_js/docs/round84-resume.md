# Round 84 games resume

Parked on `r84-b22-level-admission`, based on main
`e9b0ba2ef22b927ebfd50a59301d0a37a09fb33d`. Nothing from this bundle was merged.

## Reverification and scope

- `platformer-world-fetch-byte-and-time-admission`: already fixed on main;
  skipped. Existing streamed-byte, deadline, disposal and supersession tests pass.
- `platformer-world-total-geometry-budget`: already fixed on main; skipped.
  Existing world/active geometry and append-budget tests pass.
- `platformer-future-level-playability-preflight`: implemented. Every replacement
  and append candidate requires Boss and Portal, including future levels.
  Next-level construction completes before publishing its index or clearing shots.
- `platformer-ldtk-typed-singleton-field-admission`: implemented. Duplicate
  Player/Boss/Portal and recognized fields reject; IsPowerUp must be boolean.
  Missing optional fields keep their existing defaults.

README, editor guide, level notes and Unreleased changelog match these changes.

## Validation and blockers

Node 26.13.0; dependencies installed with `npm ci --ignore-scripts`.
All 422 tests pass. Five new playability/transition regressions failed before
the Game fix; 28 duplicate/typed-field regressions failed before the loader fix.
Tests use synthetic worlds and streamed fetch responses, without platform checks.
ESLint passes with the three existing console warnings; formatting, production
build, documentation build and dependency audit pass (zero vulnerabilities).
There is no separate typecheck command.

`npm run test:browser` cannot launch Chromium in this sandbox. It exits before
executing browser assertions: macOS `bootstrap_check_in` for Chromium's
MachPortRendezvousServer returns `Permission denied (1100)`, followed by SIGTRAP.
Run this check outside the restricted sandbox; do not substitute GitHub Actions.

The first Opus review returned `PROVIDER_ERROR`, not a review verdict:
“Failed to authenticate: OAuth session expired and could not be refreshed”.
Model `claude-opus-5-5`, effort `high`. No review findings were produced.
Local artifacts: workspace `.cache/r84-b22-review-1/` (outside this clone).

## Continue

Restore Claude OAuth, fetch main and reverify/rebase this branch if main moved.
Review the entire parked branch against main, because its implementation is
already committed; run the installed claude-review-loop with
`--baseline-ref origin/main --record-baseline --model claude-opus-5-5 --effort high`
and a fresh run directory. Keep its ledger and locks in a writable workspace cache.
Follow the owner's four-round/progress stopping rules. Review is still required.

From `platformer_js`, run lint, format:check, test:run, test:browser, build,
build:docs and npm audit locally. With clean/suggestion-only review and every
local gate passing, fetch immediately before merging, rebase and repeat checks
if main moved, merge with `--no-ff`, repeat full checks, push main, and verify
using `git ls-remote`. No PRs, Actions fallback, deploys, releases, tags or remote
branch deletion.
