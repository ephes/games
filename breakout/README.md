# Breakout

A standalone Rust/Bevy 0.13.2 example. Run `cargo run` from this directory to
play; arrow keys move the paddle. The game needs graphics and audio devices.

## Local checks

From this directory, resolve dependencies once with `cargo generate-lockfile`
(the repository ignores Cargo.lock), then keep that local resolution for checks:

```sh
cargo fmt --check
cargo check --locked
cargo clippy --locked --all-targets
cargo test --locked
```

The round-106 macOS validation used rustc/Cargo 1.99.0, resolving Bevy 0.13.2
and 416 packages. The system Rust 1.100 fails compiling the old macOS dependency
`objc2 0.4.1`; when using rustup, put its shims ahead of Homebrew so Cargo also
uses the selected compiler:

```sh
export PATH="$HOME/.cargo/bin:$PATH"
export RUSTUP_TOOLCHAIN=1.99.0
```

Then run the checks above. Keep the generated Cargo.lock for reproducible
subsequent checks; a fresh resolution can select newer transitive dependencies.
The tests use synthetic ECS entities and Bevy math, without starting default
plugins, opening a window, loading game assets or accessing an audio device.

## Collision policy

The ball advances to the earliest swept circle/AABB contact, reflects and uses
only the remaining tick time for further motion. Sweeps test straight faces and
round corner arcs, so thin bricks/walls cannot be crossed between sampled poses
and square corner near-misses do not become hits. Paddle collisions use relative
motion from its old position to its clamped new position during the tick, with
reflection in the paddle's moving frame.

Simultaneous contacts are collected before response, ordered by normal and
collider velocity rather than entity insertion order. Only approaching normals
reflect; duplicate faces reflect once. Corner normals are radial. The solver
allows at most 32 contact passes per tick; if exhausted it leaves remaining ball
motion unapplied rather than crossing an unchecked obstacle. Existing overlaps
are detected as contacts but are not yet separated by this sweep.

Each hit brick scores once and is retired immediately from the remaining sweep,
then despawned before the next fixed tick. A brick behind a reflecting wall is
not hit. Impact events are coalesced by the sound consumer per fixed tick.
Headless regressions compare large ticks with equivalent step partitions,
including multiple wall bounces and moving-paddle contacts, and exercise rounded
corner misses and contact-budget exhaustion.

## Stepping UI and fixed-tick effects

Press backquote to toggle stepping, S to step a system and Space to continue the
frame. UI initialization waits until all selected schedules are initialized.
Incomplete attempts publish no mappings or ready state and can retry; even an
empty selection creates one UI. UI construction and updates run in an ordered
chain so deferred entity creation is visible to the updater.

Gameplay uses the same chained FixedUpdate systems in the game and its schedule
test. Brick despawns are applied before later fixed ticks, so each brick awards
once during catch-up. Walls survive and never score. The sound consumer drains
all contacts into one audio entity per **fixed tick**, not per rendered frame;
a quiet following tick cannot replay them. Tests run multiple fixed ticks
without an Update/render pass and inspect audio entities without an audio
plugin. Stepping tests use an in-memory asset reader; no game files are read.
