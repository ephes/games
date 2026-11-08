# NexNex

From this directory run `cargo run --release` with a graphical display. Assets
load from `assets/Typical_2D_platformer_example.ldtk`. A/D or arrows move,
W/S or up/down climbs, Space/up jumps, and R restarts loaded levels.

Patrols turn at endpoints and skip coincident waypoints within a bounded
out-and-back traversal; an entirely coincident route stops.
The camera uses a rounded 16:9 viewport of at least 16 by 9 world units. When
rounding makes the viewport larger than a level, that axis stays at the level
origin. Scroll extents never become negative.

Local checks: `cargo fmt --check`, `cargo check`,
`cargo clippy --all-targets -- -D warnings`, and `cargo test`.
Tests use synthetic geometry and headless ECS apps; no GPU or window is needed.
