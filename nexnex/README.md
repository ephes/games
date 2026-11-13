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

Level selection keeps the current level while the player remains inside it.
Otherwise, overlapping candidates use authored project order, independent of ECS
spawn order. Bounds are half-open: minimum edges belong to a level, maximum
edges belong to the neighboring level beginning there. Outside every loaded
level, the current selection is retained.

Selection and camera fitting use propagated world coordinates after physics and
transform propagation. Level bounds include parent translation and scale; the
camera fits the world-space bounds and converts its position into its own
parent's coordinates. Its global pose is published in the same frame, before
Bevy's camera projection update and frustum culling, so both use the fitted
view. Restart
transforms the authored spawn plus layer offsets through the level and back into
the surviving Worldly player's parent space. Headless integration tests cover
translated/scaled worlds, independent layer and camera offsets, level crossings
and restart without duplicating the player.

Wall colliders use each tile's source `LayerMetadata`, including its grid size
and pixel offsets. Layers are merged independently. ECS tile additions, grid or
parent changes, removals, and layer changes replace that layer's generated
colliders from its complete current cell set. Level/layer removal retires the
colliders. Invalid grids produce a warning and retain previous geometry until
corrected. Cells without source layer metadata are refused with a warning. Live
layer metadata allows collision state to survive temporary project-asset
unavailability.

R resets the surviving Worldly player to the selected level's authored Player
spawn and respawns the loaded levels. Velocity, ground contacts, climb contacts,
and climbing gravity are cleared. If the selected level has no unique Player
spawn, restart uses the first level with a unique Player spawn in project order
(the shipped neighboring levels have no Player spawn). The player is retained;
LDtk's Worldly identity prevents a second player during level respawn. Restart
supports exactly one authored Player per project, as in the shipped game;
missing project data or missing/ambiguous spawn evidence leaves restart
unavailable until valid data returns.

Missing or inconsistent project handles/assets temporarily leave level selection,
camera, and live collision geometry unchanged. When a loaded replacement project
no longer contains the selection, selection falls back to its first level in
project order; an empty project stays unavailable. Camera fitting resumes when
the selected level is spawned. Headless journey tests run LDtk 0.14's public
spawn, cleanup, and Worldly-adoption systems with synthetic in-memory projects.

Player inventory conversion accepts a non-null `items` enum array. A missing,
wrongly typed or null-containing field logs an authoring warning and produces an
empty inventory, without panicking or partially importing items. Level reload
retains an existing Worldly player's inventory and position; a newly constructed
player uses the same safe conversion.

Authored entity physics roles remain: Player has a dynamic 12 by 28 collider,
zero friction with the minimum combine rule and locked rotation; Chest has a
dynamic 16 by 16 collider, friction 0.5 and density 15; Mob has a kinematic
velocity-based 10 by 10 collider with locked rotation. The player's single child
foot sensor has half-extents (3, 2), sits at local (0, -14), and requests collision
messages. Ladder IntGrid value 2 creates a 16 by 16 sensor, never solid ground.
Headless fixtures load synthetic Player/Chest/Mob and IntGrid entries through
LDtk's public spawning APIs into Rapier. Fixed simulation steps verify chest
support and actual ladder/foot-sensor overlap without synthetic collision messages.
The collider oracle pins exact extents; a one-off manual mutation of the player
width made it fail, but no automated test mutates colliders.

Local checks (headless tests use synthetic ECS entities, geometry and in-memory
LDtk data, no window or GPU):

```sh
cargo fmt --check
cargo check
cargo clippy --all-targets -- -D warnings
cargo test
```
