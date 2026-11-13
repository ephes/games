# Changelog

## Unreleased

- Keep mobs stationary when authored patrol data is missing, wrongly typed or
  contains null points; valid sibling entities continue loading.
- Preserve patrol travel beyond waypoints, including multiple corners and full
  cycles in one physics step, independently of frame partitioning.
- Give ladder climbing precedence over ArrowUp's grounded jump shortcut;
  Space still jumps off, including simultaneous climb/jump input.
- Refresh the player's owned foot sensor when cuboid geometry changes, clear
  stale ground contacts and remove the sensor for unsupported shapes; unchanged
  geometry keeps its sensor and returning to a cuboid restores detection.
