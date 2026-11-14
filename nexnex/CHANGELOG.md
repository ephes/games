# Changelog

## Unreleased

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
