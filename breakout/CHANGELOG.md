# Changelog

## Unreleased

- Reflect simultaneous contacts once per axis using incoming velocity, independent
  of collider insertion order, while preserving brick scoring and contact events.
- Add headless numerical contact tests for faces, corners, tangency, misses and
  embedded centers, including translated and scaled colliders.
- Keep stepping UI initialization retryable until every selected schedule is
  ready, then publish mappings and readiness together; empty selections initialize
  only once.
- Add headless fixed-tick coverage for deferred brick despawn, score ownership,
  per-tick sound coalescing and event draining during catch-up.
