# NexNex

A Bevy/LDtk platformer using Rapier. From this directory run
`cargo run --release` (requires a graphical display). Assets are loaded from
`assets/Typical_2D_platformer_example.ldtk`.

Move with A/D or left/right; W/S or up/down climbs ladders; Space/up jumps;
R restarts loaded levels.

Collision observations run before grounded state, player movement, and climbing
gravity, in that order, at the existing Update cadence. Physics messages produced
in Rapier's PostUpdate are consumed on the next Update. Removed ground/ladder
contacts are pruned even when no stopped message arrives.

Local checks (headless tests use synthetic ECS entities, no window or GPU):

```sh
cargo fmt --check
cargo check
cargo clippy --all-targets -- -D warnings
cargo test
```
