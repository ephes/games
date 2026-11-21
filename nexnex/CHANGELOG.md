# Changelog

## Unreleased

- Avoid publishing identical climbing gravity values during contact changes or
  when restoring an already-zero base gravity.

- Mark ladder contact sets changed only when adding or removing a contact,
  including cleanup of despawned ladders.

- Mark the player's `Climber` changed only when its climbing state changes,
  instead of on every movement update.

- Restrict level fitting to the platformer camera so additional cameras keep
  their own projections and transforms.

- Clear stale ground contacts and ignore queued starts when a supporting
  collider is removed and reinserted within one update. Accept fresh starts
  from later physics steps.

- Find the restart spawn in one authored-order pass and refuse a second Player
  immediately. Reuse the first spawn's level and layer for its coordinates.
- Size ladder sensors from their authored LDtk layer grid rather than assuming
  16 pixels, preserving real climb coverage without reaching adjacent cells.
- Cache validated patrol cycle lengths with immutable route points at construction
  and replacement; reuse them at arrivals while retaining residual travel and
  endpoint behavior across frame partitions.

- Index loaded level transforms once per selection pass, keeping current-level
  preference, authored overlap order and half-open world-space bounds.
- Bind climbing gravity ownership to each inserted GravityScale generation,
  including replacement and same-frame removal/reinsertion; restore only the
  new base without recreating missing components or entities.

- Admit positive patrol layer/entity geometry, checked pixel extents and coordinate
  conversion before constructing routes. Use widened integer point adjustments
  to avoid overflow, saturation and premature float rounding; refuse a bad mob's
  route with one warning while retaining stationary behavior and valid siblings.
- Collapse consecutive identical authored patrol points once at construction;
  stationary routes retain one point for constant update work, while A-B-A
  revisits preserve travel across frame partitions.

- Index ground sensors by owner once per update for linear average ownership
  work during bulk load/resize, preserving equal geometry and contact retirement.

- Restore the pre-climb gravity scale when Climber is removed or climbing ends;
  preserve unrelated gravity overrides and retire ownership on despawn/readdition.
- Refuse overflowing or malformed restart geometry before resetting any player
  state or scheduling level respawn, with one warning per restart attempt.
- Fix collider/foot-sensor reinsertion: retire removed Collider handles even
  within one frame, and backport Parry's partial-root BVH cleanup to prevent
  `key not present` after removing and restoring the pair. A deterministic
  three-collider regression verifies repeated cycles, backend ownership,
  stale-contact rejection and renewed grounding.
- Retire owned ground sensors when Collider or GroundDetection disappears,
  including removal/reinsertion within one frame; clear surviving grounded state
  and ignore queued contacts for retired sensors.
- Admit wall grid work (at most 1,000,000 cells) and checked pixel coordinates
  before replacing live geometry; use widened center/extent arithmetic and
  retain the last valid collisions on refusal.
- Use per-row hashed plate membership for linear average merge work, retaining
  ordered rectangle assembly and exact tile coverage.

- Keep mobs stationary when authored patrol data is missing, wrongly typed or
  contains null points; valid sibling entities continue loading.
- Preserve patrol travel beyond waypoints, including multiple corners and full
  cycles in one physics step, independently of frame partitioning.
- Give ladder climbing precedence over ArrowUp's grounded jump shortcut;
  Space still jumps off, including simultaneous climb/jump input.
- Refresh the player's owned foot sensor when cuboid geometry changes, clear
  stale ground contacts and remove the sensor for unsupported shapes; unchanged
  geometry keeps its sensor and returning to a cuboid restores detection.
- Stabilize patrol direction at exact turnaround times despite small floating
  point differences between frame partitions.
