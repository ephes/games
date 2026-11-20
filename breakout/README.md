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
motion from its old position to its clamped new position during the tick for
contact detection. The response reflects the ball's own normal speed; a moving
paddle can raise the outgoing normal speed at most to its own normal speed, so
it pushes the ball but never adds energy on top. Top hits from a horizontally
moving paddle are plain reflections.

The paddle's wall padding is narrower than the ball. While the ball is beside
the paddle (outside its width and within one ball diameter of its height), the
paddle stops at least one ball diameter plus one unit from that wall, so it can
never squeeze the ball into a gap it does not fit. The solver itself does not
resolve such squeezes between a moving and a static collider. Headless
regressions push resting, slow and diagonal balls against both side walls and
check that the ball stays inside the arena with bounded speed.

Simultaneous contacts are collected before response, ordered by normal and
collider velocity rather than entity insertion order. Only approaching normals
reflect; duplicate faces reflect once. Corner normals are radial. The solver
allows at most 32 contact passes per tick; if exhausted it leaves remaining ball
motion unapplied rather than crossing an unchecked obstacle.

An existing overlap is separated before continuing motion, using the shortest
escape from the circle/box intersection plus a 0.0001-unit numerical skin. For a
center inside/on the box, the nearest face wins; exact distance ties prefer
Bottom, Top, Left, then Right. Outside corners separate radially. Simultaneous
corrections are ordered by normal, collider velocity, center and size, and each
remaining penetration is recomputed after earlier corrections. Recovery shares
the 32-pass limit, including a zero-duration tick.

A recovered penetration or approaching contact emits an impact. Exact resting,
outgoing and tangential wall contacts do not emit repeated effects; touching a
brick still removes/scores it once. Headless regressions keep recovered balls
nonpenetrating and finite across later ticks and verify quiet tangent motion.

Each hit brick scores once and is retired immediately from the remaining sweep,
then despawned before the next fixed tick. A brick behind a reflecting wall is
not hit. Impact events are coalesced by the sound consumer per fixed tick.
Headless regressions compare large ticks with equivalent step partitions,
including multiple wall bounces and moving-paddle contacts, and exercise rounded
corner misses and contact-budget exhaustion.

## Stepping UI and fixed-tick effects

Press backquote to toggle stepping. S runs one system at the stepping cursor.
Space continues the frame from that cursor, including the whole frame if the
cursor is at the start. Both actions leave stepping enabled. UI initialization
waits until all selected schedules are initialized.
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
