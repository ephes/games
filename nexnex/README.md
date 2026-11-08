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

Patrols turn at endpoints and skip coincident waypoints within a bounded
out-and-back traversal; an entirely coincident route stops.
The camera uses a rounded 16:9 viewport of at least 16 by 9 world units. When
rounding makes the viewport larger than a level, that axis stays at the level
origin. Scroll extents never become negative.

Wall colliders use each tile's source `LayerMetadata`, including its grid size
and pixel offsets. Layers are merged independently. ECS tile additions, grid or
parent changes, removals, and layer changes replace that layer's generated
colliders from its complete current cell set. Level/layer removal retires the
colliders. Invalid grids produce a warning and retain previous geometry until
corrected. Cells without source layer metadata are refused with a warning. Live
layer metadata allows collision state to survive temporary project-asset
unavailability.

Local checks (headless tests use synthetic ECS entities, geometry and in-memory
LDtk data, no window or GPU):

```sh
cargo fmt --check
cargo check
cargo clippy --all-targets -- -D warnings
cargo test
```
