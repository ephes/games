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

The initial round-80 validation used rustc 1.99.1 and Cargo 1.99.1, resolving
Bevy 0.13.2 and 416 packages. Keep the generated Cargo.lock for reproducible
subsequent checks; a fresh resolution can select newer transitive dependencies.
The tests use synthetic ECS entities and Bevy math, without starting default
plugins, opening a window, loading game assets or accessing an audio device.

## Collision policy

Circle/AABB contact includes exact tangency. The side is the axis with the
larger absolute offset from the closest point on the box. Equal offsets choose
the vertical axis; a center inside or on the box has zero offset and chooses
Bottom. These are the example's existing classifier rules, not a penetration
solver. The numerical tests cover translated and uniformly scaled boxes.

All contacts in one fixed tick use the incoming ball velocity. A contact only
requests reflection when that velocity points into its face, and each axis is
reflected at most once after collecting contacts. Each hit brick scores once
and is despawned; each contact still emits its own event for the sound consumer.
