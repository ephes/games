# Round 84 resume

Branch: `r84-b21-world-budgets`, based on `main` at
`5b8b48e7b620d2defe4962499c105bd16253d65b`. Origin was verified as
`git@github.com:ephes/games.git`; a final fetch still showed that main commit.
Nothing has been merged or deployed.

## Implemented, awaiting review and browser validation

Bundle B21, in report order:

- `platformer-world-fetch-byte-and-time-admission`
- `platformer-world-total-geometry-budget`

Both were reverified against current main and were still unfixed. Changes bound
streamed transfer bytes/time, cancel superseded/disposed transfers, preflight
aggregate geometry and bound active collision geometry. README and Unreleased
notes describe the limits. Import tests now use synthetic streamed fetch
fixtures; the existing large programmatic geometry regression remains covered.

Local validation on Node 26.13.0:

- `npm ci --ignore-scripts`: passed.
- `npm run lint`: passed with the existing three console warnings.
- `npm run format:check`: passed.
- `npm run test:run`: 387 tests passed across 28 files.
- `npm run build` and `npm run build:docs`: passed.
- `npm audit --json`: zero vulnerabilities.
- No separate typecheck command exists in this JavaScript project.
- Original-main regression replay: 13 failures / 2 passes in the initial
  15-test admission suite; only the exported limits were supplied to the old
  code for test import compatibility. Two additional passing tests cover the
  exact byte limit and combined append level limit.

`npm run test:browser` is blocked at Chromium launch by the macOS sandbox:
`MachPortRendezvousServer … Permission denied (1100)`. Run it outside this
sandbox; do not substitute GitHub Actions.

Required review attempted with `claude-review-loop`, `claude-opus-5-5`, high
effort. It returned `PROVIDER_ERROR`, with no verdict or reviewed findings:
“Failed to authenticate: OAuth session expired and could not be refreshed”.
No review passed. Review artifacts are local to the workspace at
`../reviews/b21-round1/` relative to the clone root.

## Continue after authentication is restored

1. Fetch origin and rebase the parking branch onto current main; reverify the
   slices if main moved.
2. Run all local checks above, including the browser smoke outside the sandbox.
3. Run a fresh full B21 Opus 5.5 high-effort review. Fix/re-review findings under
   the owner's four-round/recurrence stopping rules. The failed authentication
   attempt is not a completed review round.
4. Only after a passing review and all checks: fetch immediately before merge,
   rebase and rerun checks if origin moved, merge locally with `--no-ff`, run the
   full local checks after merge, push main and verify with `git ls-remote`.
5. Continue B22 in report order:
   `platformer-future-level-playability-preflight`, then
   `platformer-ldtk-typed-singleton-field-admission`. Both were observed still
   unfixed on current main, but neither was implemented because the owner
   requires stopping when OAuth blocks review. Reverify before implementation.

Use the full descriptions and validation notes in
`~/workspaces/ws-work-planning/reviews/scout-round84.md`. Do not deploy, release,
tag, open PRs, invoke Actions or delete remote branches. Push feature branches
only to park unfinished work. Remove or update this resume note when resolved.
