# NexNex

A Bevy/LDtk platformer using Rapier. From this directory run
`cargo run --release` (requires a graphical display). Assets are loaded from
`assets/Typical_2D_platformer_example.ldtk`.

Move with A/D or left/right. W/S or up/down enters and climbs ladders. While
in ladder range, up has the same climb action as W, including from the ground;
Space jumps off and restores gravity (also when up is pressed simultaneously).
Away from ladders, Space or up jumps from the ground; neither allows an air jump.
Holding up after jumping off does not re-enter until another climb key press.
R restarts loaded levels.

Collision observations run before grounded state, player movement, and climbing
gravity, in that order, at the existing Update cadence. Physics messages produced
in Rapier's PostUpdate are consumed on the next Update. Removed ground/ladder
contacts are pruned even when no stopped message arrives. Climbing owns the
zero-gravity override only while active: leaving a ladder or removing `Climber`
restores the pre-climb gravity scale before Rapier runs. A different nonzero
gravity override is retained; removal/readdition starts fresh ownership, and
despawn never recreates an entity. Removing or inserting/replacing `GravityScale`
retires the old component's cached base, including removal/reinsertion within one
frame. A new gravity component on an active climber is suppressed before Rapier
steps and its own base is restored on exit. Ordinary mutable nonzero overrides
from other features remain intact on exit; removed components stay absent.

Ladder contact observation marks `Climber` changed only when contact membership
changes.

Missing, wrongly typed or null-containing Mob `patrol` arrays produce one
authoring warning and a stationary route at the spawn, without partially
importing points or preventing valid sibling mobs from loading. Empty arrays
also stay at the spawn. Patrol construction checks positive layer and entity
sizes, both signed 32-bit pixel extents, finite pivots and checked Y inversion.
Authored point adjustments use widened integer arithmetic before conversion to
world floats; coordinates outside the signed pixel range are refused. A bad
route emits one warning and keeps only its safe spawn point (or no points when
even spawn geometry is invalid); patrol updates leave that mob stationary and
valid siblings continue loading. No partial route is admitted.

Patrols travel at 75 world units per simulated second and turn at endpoints.
Each constructed/replaced route owns its validated finite out-and-back cycle
length. Points are read-only after construction, so waypoint arrivals reuse that
metric without scanning the route; stepping work follows the crossed legs.
After Rapier writes back movement, distance beyond a waypoint carries around
subsequent corners before transform propagation/rendering. Complete out-and-back
cycles are skipped arithmetically, so even a long step or repeated points needs
at most one bounded traversal. Construction collapses consecutive identical
waypoints, including an initial point equal to the spawn; an entirely coincident
route retains one point and takes constant work per update. Nonconsecutive
revisits such as A-B-A remain part of the route. Headless
Rapier tests compare equal elapsed time split into 1, 2, 19, 38 and 76 steps,
including multiple short legs, a full cycle, repeated points and both exact
turnaround times. A 0.0001 world-unit arrival tolerance absorbs f32 drift at
waypoints so the outgoing direction agrees at turnaround times.
The camera uses a rounded 16:9 viewport of at least 16 by 9 world units. When
rounding makes the viewport larger than a level, that axis stays at the level
origin. Scroll extents never become negative. Level fitting applies only to the
camera created by game setup. Additional cameras keep their own projections and
transforms while the platformer camera follows level changes.

Level selection keeps the current level while the player remains inside it.
Otherwise, overlapping candidates use authored project order, independent of ECS
spawn order. Bounds are half-open: minimum edges belong to a level, maximum
edges belong to the neighboring level beginning there. Outside every loaded
level, the current selection is retained. Each selection pass indexes the loaded
IID-to-world-transform pairs once, then checks candidates in project order with
constant-time average lookup. Headless operation-count tests cover 100, 200 and
400 loaded levels alongside the overlap/seam fixtures.

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

A wall layer admits at most 1,000,000 cells (`width * height`, including empty
cells), positive grid dimensions/size, valid cell coordinates, and pixel extents
and shifted edges representable as signed 32-bit integers. Negating the authored
Y offset must also fit. Admission runs before scanning cells or retiring live
colliders; refusal warns and retains the last good geometry until corrected.
Centers and half-extents use widened integer arithmetic before float conversion.
Per-row hashed plate membership keeps merge work linear in the number of plates
on average while ordered row vectors preserve deterministic rectangle assembly.
Tests count cell probes and plate identity/hash operations instead of elapsed
time and check exact non-overlapping coverage for every 3 by 3 grid.

R resets the surviving Worldly player to the project's sole authored Player
spawn and respawns the loaded levels. Velocity, ground contacts, climb contacts,
and climbing gravity are cleared. The spawn's level becomes selected, including
when the player restarts from a neighboring level. LDtk's Worldly identity
prevents a second player during level respawn. Restart scans authored entities
in project order once and stops at the second Player. Missing project data or a
missing or duplicate Player spawn leaves restart unavailable until valid data
returns. Restart checks that level, entity and definition dimensions are positive,
that signed 32-bit coordinate conversions fit and that the full spawn transform
is finite, including scale and parent conversion. Invalid geometry
emits one authoring warning per restart attempt and leaves the player's pose,
physics, contacts, selection and level respawn markers unchanged. Coordinates
that would overflow LDtk conversion or the unloaded-level world offset are
refused equally in debug and release builds.

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
messages. Ladder IntGrid value 2 creates a square sensor matching the source layer's
authored grid size through LDtk's custom bundle API, never solid ground.
Headless LDtk/Rapier fixtures cover grids 8, 16 and 32: contacts reach the
inside edge of a ladder tile while the adjacent ordinary cell stays unclimbable.
Headless fixtures load synthetic Player/Chest/Mob and IntGrid entries through
LDtk's public spawning APIs into Rapier. Fixed simulation steps verify chest
support and actual ladder/foot-sensor overlap without synthetic collision messages.
The collider oracle pins exact extents. Replacing/resizing a live cuboid retires
the old foot sensor and clears grounding before movement, then creates exactly
one sensor with half-width equal to half the body's half-width, height 4 and
offset at the body's bottom. Grounding resumes only from new collision messages;
unchanged geometry retains its sensor and contacts.
A single owner-to-sensor inventory serves all changed detectors per update, so
loading or resizing many bodies needs linear average ownership work rather than
one complete sensor scan per body. Tests count owner reads for 1, 100 and 1000
simultaneous changes and verify retained/replaced sensor identities. Unsupported
shapes remove the sensor, warn and remain ungrounded until a cuboid returns.
A headless Rapier fixture replaces the collider on an already grounded player, checks geometry,
verifies jump refusal until new support overlaps, and exercises unsupported-shape
replacement and recovery.
Removing either Collider or GroundDetection retires every owned sensor before
collision observation and movement and clears any surviving detector's grounded
state. Re-adding creates a fresh sensor identity, including removal/reinsertion
within one frame; queued contacts for retired sensors cannot enable a jump.
The component lifecycle tests cover actual grounded Rapier players and queued
retired contacts. Removing a Collider also retires its Rapier handle explicitly,
so removal/reinsertion before backend synchronization cannot retain the old
handle while the sensor gets a fresh identity. A three-collider Rapier regression
(player, foot sensor, floor; no padding geometry) repeatedly removes and restores
the pair both within one frame and across physics steps. It checks handle and
entity ownership, one sensor attached to the surviving body, stale-contact
rejection and grounding from new real overlaps.

When a supporting platform's collider is removed and reinserted within one
update, its old foot contacts and queued starts are discarded before movement.
Other supports remain valid, and a later physics step can report fresh contact
with the replacement.

Parry 0.25.3 leaves orphaned BVH nodes when multiple removals reduce the tree to
one leaf. Its optimizer can corrupt that partial root, causing `key not present`
on the next insertion. NexNex uses a local backport of the upstream partial-root
cleanup fix via Cargo's dependency patch mechanism; the Bevy/Rapier versions stay
unchanged. See [vendor maintenance notes](vendor/README.md) for provenance,
the exact changes and when to remove the patch.

Local checks (headless tests use synthetic ECS entities, geometry and in-memory
LDtk data, no window or GPU):

The application currently ignores Cargo.lock. On a fresh checkout, generate the
local lockfile once with `cargo generate-lockfile` before running locked tests.

```sh
cargo fmt --check
cargo check
cargo clippy --all-targets -- -D warnings
cargo test --locked
```
