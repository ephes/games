# Changelog

## Unreleased

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
