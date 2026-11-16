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
    mut climbers: Query<&mut Climber>,
    climbables: Query<Entity, With<Climbable>>,
    mut collisions: MessageReader<CollisionEvent>,
) {
    for collision in collisions.read() {
        match collision.to_owned() {
            CollisionEvent::Started(collider_a, collider_b, _) => {
                if let (Ok(mut climber), Ok(climbable)) =
                    (climbers.get_mut(collider_a), climbables.get(collider_b))
                {
                    climber.intersecting_climbables.insert(climbable);
                }
                if let (Ok(mut climber), Ok(climbable)) =
                    (climbers.get_mut(collider_b), climbables.get(collider_a))
                {
                    climber.intersecting_climbables.insert(climbable);
                };
            }
            CollisionEvent::Stopped(collider_a, collider_b, _) => {
                if let Ok(mut climber) = climbers.get_mut(collider_a) {
                    climber.intersecting_climbables.remove(&collider_b);
                }
                if let Ok(mut climber) = climbers.get_mut(collider_b) {
                    climber.intersecting_climbables.remove(&collider_a);
                }
            }
        }
    }
    for mut climber in &mut climbers {
        climber
            .intersecting_climbables
            .retain(|entity| climbables.contains(*entity));
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
                    gravity.0 = previous;
                }
            }
        }
    }
    for entity in candidates {
        let Ok((mut gravity, Some(climber))) = bodies.get_mut(entity) else {
            continue;
        };
        if climber.climbing {
            owned_gravity.entry(entity).or_insert(gravity.0);
            gravity.0 = 0.;
        } else if let Some(previous) = owned_gravity.remove(&entity) {
            if gravity.0 == 0. {
                gravity.0 = previous;
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
