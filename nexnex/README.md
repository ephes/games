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

R restarts loaded levels and resets the surviving Worldly player to the selected
level's authored Player spawn. Velocity, ground contacts, climb contacts, and
climbing gravity are cleared. If the selected level has no unique Player spawn,
restart uses the first level with a unique Player spawn in project order (the
shipped neighboring levels have no Player spawn). The player is retained; LDtk's
Worldly identity prevents a second player during level respawn. Restart supports exactly one authored Player per project, as in the shipped game;
missing project data or missing/ambiguous spawn evidence leaves restart unavailable
until valid data returns.

Missing or inconsistent project handles/assets temporarily leave level selection,
camera, and live collision geometry unchanged. When a loaded replacement project
no longer contains the selection, selection falls back to its first level in
project order; an empty project stays unavailable. Camera fitting resumes when
the selected level is spawned. Headless journey tests run LDtk 0.14's public
spawn, cleanup, and Worldly-adoption systems with synthetic in-memory projects.
