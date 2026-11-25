use bevy::ecs::message::MessageReader;
use bevy::prelude::*;
use bevy_ecs_ldtk::prelude::*;
use bevy_rapier2d::prelude::*;
use std::collections::{HashMap, HashSet};

use crate::colliders::SensorBundle;

#[derive(Clone, Eq, PartialEq, Debug, Default, Component)]
pub struct Climber {
    pub climbing: bool,
    pub intersecting_climbables: HashSet<Entity>,
}

#[derive(Copy, Clone, Eq, PartialEq, Debug, Default, Component)]
pub struct Climbable;

#[derive(Clone, Default, Bundle)]
pub struct LadderBundle {
    pub sensor_bundle: SensorBundle,
    pub climbable: Climbable,
}

impl LdtkIntCell for LadderBundle {
    fn bundle_int_cell(_: IntGridCell, layer: &LayerInstance) -> Self {
        Self {
            sensor_bundle: SensorBundle {
                collider: Collider::cuboid(
                    layer.grid_size as f32 / 2.,
                    layer.grid_size as f32 / 2.,
                ),
                sensor: Sensor,
                active_events: ActiveEvents::COLLISION_EVENTS,
                rotation_constraints: LockedAxes::ROTATION_LOCKED,
            },
            climbable: Climbable,
        }
    }
}

pub fn detect_climb_range(
    mut commands: Commands,
    mut climbers: Query<&mut Climber>,
    climbables: Query<Entity, (With<Climbable>, With<Collider>)>,
    ladders: Query<(), With<Climbable>>,
    mut removed_colliders: RemovedComponents<Collider>,
    mut collisions: MessageReader<CollisionEvent>,
) {
    // Queued collision events identify entities, not collider generations.
    let retired: HashSet<_> = removed_colliders.read().collect();
    for entity in &retired {
        // Rapier only notices a missing Collider at backend sync. Retire the
        // old handle so a replacement inserted before then gets a new Rapier
        // collider and a fresh Started event while still overlapping.
        if ladders.contains(*entity) {
            if let Ok(mut ladder) = commands.get_entity(*entity) {
                ladder.remove::<RapierColliderHandle>();
            }
        }
    }
    let is_live = |entity| climbables.contains(entity) && !retired.contains(&entity);

    for mut climber in &mut climbers {
        if climber
            .intersecting_climbables
            .iter()
            .any(|entity| !is_live(*entity))
        {
            climber
                .intersecting_climbables
                .retain(|entity| is_live(*entity));
        }
    }
    for collision in collisions.read() {
        let (a, b, started) = match *collision {
            CollisionEvent::Started(a, b, _) => (a, b, true),
            CollisionEvent::Stopped(a, b, _) => (a, b, false),
        };
        for (entity, contact) in [(a, b), (b, a)] {
            let Ok(mut climber) = climbers.get_mut(entity) else {
                continue;
            };
            let already_in_range = climber.intersecting_climbables.contains(&contact);
            if started && !already_in_range && is_live(contact) {
                climber.intersecting_climbables.insert(contact);
            } else if !started && already_in_range {
                climber.intersecting_climbables.remove(&contact);
            }
        }
    }
}

#[derive(Resource, Default)]
pub(crate) struct GravityInsertions(HashSet<Entity>);

pub(crate) fn observe_gravity_insert(
    event: On<Insert, GravityScale>,
    mut insertions: ResMut<GravityInsertions>,
) {
    // Insert fires for both a new component and insertion over an existing one,
    // but not for ordinary Mut writes (including our own zero-gravity write).
    insertions.0.insert(event.entity);
}

pub fn ignore_gravity_if_climbing(
    mut removed: RemovedComponents<Climber>,
    mut removed_gravity: RemovedComponents<GravityScale>,
    changed: Query<Entity, Changed<Climber>>,
    mut bodies: Query<(&mut GravityScale, Option<&Climber>)>,
    mut insertions: ResMut<GravityInsertions>,
    mut owned_gravity: Local<HashMap<Entity, f32>>,
) {
    let mut candidates: HashSet<_> = changed.iter().collect();
    for entity in insertions.0.drain() {
        owned_gravity.remove(&entity);
        candidates.insert(entity);
    }
    // A removed gravity component retires its base before Climber cleanup can
    // restore anything. Reinsertion (even in this update) owns a new base.
    for entity in removed_gravity.read() {
        owned_gravity.remove(&entity);
    }
    // Retire ownership first, including removal and readdition in one update.
    // A different nonzero gravity value belongs to another feature.
    for entity in removed.read() {
        if let Some(previous) = owned_gravity.remove(&entity) {
            if let Ok((mut gravity, _)) = bodies.get_mut(entity) {
                if gravity.0 == 0. {
                    gravity.set_if_neq(GravityScale(previous));
                }
            }
        }
    }
    for entity in candidates {
        let Ok((mut gravity, Some(climber))) = bodies.get_mut(entity) else {
            continue;
        };
        if climber.climbing {
            let base = owned_gravity.entry(entity).or_insert(gravity.0);
            if gravity.0 != 0. {
                *base = gravity.0;
            }
            gravity.set_if_neq(GravityScale(0.));
        } else if let Some(previous) = owned_gravity.remove(&entity) {
            if gravity.0 == 0. {
                gravity.set_if_neq(GravityScale(previous));
            }
        }
    }
}

pub struct ClimbingPlugin;

impl Plugin for ClimbingPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<GravityInsertions>()
            .add_observer(observe_gravity_insert)
            .add_systems(
                Update,
                detect_climb_range.in_set(crate::ControlSet::Observe),
            )
            .add_systems(
                Update,
                ignore_gravity_if_climbing.in_set(crate::ControlSet::Gravity),
            )
            .register_ldtk_int_cell::<LadderBundle>(2);
    }
}
