# NexNex

Run `cargo run --release` from this directory with a graphical display. The game
loads `assets/Typical_2D_platformer_example.ldtk`. A/D or arrows move, W/S or
up/down climbs, Space/up jumps, and R restarts loaded levels.

Wall colliders use each tile's source `LayerMetadata`, including its grid size
and pixel offsets. Layers are merged independently. ECS tile additions, grid or
parent changes, removals, and layer changes replace that layer's generated
colliders from its complete current cell set. Level/layer removal retires the
colliders. Invalid grids produce a warning and retain previous geometry until corrected.
Cells without source layer metadata are refused with a warning. Live layer metadata
allows collision state to survive temporary project-asset unavailability.

Local checks: `cargo fmt --check`, `cargo check`,
`cargo clippy --all-targets -- -D warnings`, and `cargo test`.
The headless tests load synthetic LDtk data in memory and use no window or GPU.
