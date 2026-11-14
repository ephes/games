# Parry partial-root backport

`parry2d/` contains the published **parry2d 0.25.3** source, examples, manifests,
README and Apache-2.0 license from crates.io. The archive's SHA-256 is
`ef681740349cec3ab9b5996b03b459b383b6998e1ffcb2804e8b57eb1e8491d9`.
Generated Cargo.lock and cache metadata are omitted.

The source changes are:

- `src/partitioning/bvh/bvh_tree.rs`: truncate `nodes` and `parents` to one
  element when removal creates a partial root. This backports the fix in
  [dimforge/parry#409](https://github.com/dimforge/parry/pull/409), commit
  `1d882fc` (merged with its regression test on 2026-05-28). Earlier removals
  leave orphaned wide nodes for refit to compact, but Rapier optimizes before
  refitting. The optimizer must never walk those orphans as live nodes.
- `src/transformation/polygon_intersection.rs`: remove the unused `log::error`
  import, which becomes visible as a warning for a local path dependency.
- `Cargo.toml`: declare the shared source's `dim3`, `f64` and `wavefront` cfg
  values for Rust's check-cfg lint; these do not enable those features.

The behavioral fix is covered through the actual Bevy/Rapier integration by
`cargo test collider_and_sensor_reinsertion_preserves_rapier_ownership` from
`nexnex/`. It fails with the published dependency's `key not present` panic and
also fails if same-frame handle retirement is removed while the backport stays.
The test checks four removal/reinsertion cycles in each timing mode.

The fix was released upstream in Parry 0.28, outside Rapier 0.31's compatible
Parry 0.25 dependency range. Keep the patch until a deliberate Bevy/Rapier
upgrade uses a release with #409. Then remove this directory and the
`[patch.crates-io]` entry, and rerun the regression and full local gates.
Do not replace the fix with padding colliders or disabled BVH optimization.
