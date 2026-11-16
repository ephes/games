# Changelog

## Unreleased

- Advance the ball through earliest swept circle/AABB contacts, including round
  corners and relative paddle motion, with bounded remaining-time bounces and
  immediate hit-brick retirement to prevent tunnelling and through-wall scores.
- Compare high-speed wall, thin-brick and moving-paddle motion against equivalent
  step partitions in headless fixed-schedule regressions.

- Keep simultaneous face contacts independent of collider insertion order while
  preserving brick scoring and contact events.
- Add headless numerical contact tests for faces, corners, tangency, misses and
  embedded centers, including translated and scaled colliders.
- Keep stepping UI initialization retryable until every selected schedule is
  ready, then publish mappings and readiness together; empty selections initialize
  only once.
- Add headless fixed-tick coverage for deferred brick despawn, score ownership,
  per-tick sound coalescing and event draining during catch-up.
