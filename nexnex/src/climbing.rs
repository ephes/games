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

#[derive(Clone, Default, Bundle, LdtkIntCell)]
pub struct LadderBundle {
    #[from_int_grid_cell]
    pub sensor_bundle: SensorBundle,
    pub climbable: Climbable,
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

pub fn ignore_gravity_if_climbing(
    mut removed: RemovedComponents<Climber>,
    changed: Query<Entity, Changed<Climber>>,
    mut bodies: Query<(&mut GravityScale, Option<&Climber>)>,
    mut owned_gravity: Local<HashMap<Entity, f32>>,
) {
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
    for entity in &changed {
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
        app.add_systems(
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
