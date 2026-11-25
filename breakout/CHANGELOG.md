# Changelog

## Unreleased

- Use indexed flags for retired bricks and set membership for emitted impacts
  during a tick, preserving impact order and ball response.

- Skip paddle, ball and scoreboard updates when their entity is missing or
  duplicated, and tolerate a scoreboard without its score text section.
- Label Space as continuing the frame and verify that S advances one system
  and Space executes the remaining systems in a headless schedule.
- Separate embedded balls by the minimum circle/AABB displacement with explicit
  face ties and bounded recovery; keep resting/tangent wall contacts quiet.
- Add headless recovery and sound-retirement regressions for zero/inward speed,
  on-wall and corner overlaps, and repeated tangent motion.

- Advance the ball through earliest swept circle/AABB contacts, including round
  corners and relative paddle motion, with bounded remaining-time bounces and
  immediate hit-brick retirement to prevent tunnelling and through-wall scores.
- Compare high-speed wall, thin-brick and moving-paddle motion against equivalent
  step partitions in headless fixed-schedule regressions.
- Limit moving-paddle responses to the paddle's own normal speed so side and
  corner hits or paddle/wall squeezes cannot accelerate the ball without bound.
- Stop the paddle one ball diameter short of a wall while the ball is beside it,
  so overlap recovery cannot push a squeezed ball through the wall.

- Keep simultaneous face contacts independent of collider insertion order while
  preserving brick scoring and contact events.
- Add headless numerical contact tests for faces, corners, tangency, misses and
  embedded centers, including translated and scaled colliders.
- Keep stepping UI initialization retryable until every selected schedule is
  ready, then publish mappings and readiness together; empty selections initialize
  only once.
- Add headless fixed-tick coverage for deferred brick despawn, score ownership,
  per-tick sound coalescing and event draining during catch-up.
