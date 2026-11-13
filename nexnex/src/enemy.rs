use bevy::prelude::*;
use bevy_ecs_ldtk::{prelude::*, utils::ldtk_pixel_coords_to_translation_pivoted};
use bevy_rapier2d::dynamics::Velocity;

use crate::colliders::ColliderBundle;

#[derive(Copy, Clone, Eq, PartialEq, Debug, Default, Component)]
pub struct Enemy;

#[derive(Clone, Default, Bundle, LdtkEntity)]
pub struct MobBundle {
    #[sprite_sheet]
    pub sprite_sheet: Sprite,
    #[from_entity_instance]
    pub collider_bundle: ColliderBundle,
    pub enemy: Enemy,
    #[ldtk_entity]
    pub patrol: Patrol,
}

#[derive(Clone, PartialEq, Debug, Default, Component)]
pub struct Patrol {
    pub points: Vec<Vec2>,
    pub index: usize,
    pub forward: bool,
}

impl LdtkEntity for Patrol {
    fn bundle_entity(
        entity_instance: &EntityInstance,
        layer_instance: &LayerInstance,
        _: Option<&Handle<Image>>,
        _: Option<&TilesetDefinition>,
        _: &AssetServer,
        _: &mut Assets<TextureAtlasLayout>,
    ) -> Patrol {
        let mut points = Vec::new();
        points.push(ldtk_pixel_coords_to_translation_pivoted(
            entity_instance.px,
            layer_instance.c_hei * layer_instance.grid_size,
            IVec2::new(entity_instance.width, entity_instance.height),
            entity_instance.pivot,
        ));

        let ldtk_patrol_points = match entity_instance.iter_points_field("patrol") {
            Ok(points) => points,
            Err(error) => {
                warn!(
                    "Invalid patrol field on entity {}: {error}; using stationary patrol",
                    entity_instance.iid
                );
                return Patrol {
                    points,
                    index: 0,
                    forward: true,
                };
            }
        };

        for ldtk_point in ldtk_patrol_points {
            // The +1 is necessary here due to the pivot of the entities in the sample
            // file.
            // The patrols set up in the file look flat and grounded,
            // but technically they're not if you consider the pivot,
            // which is at the bottom-center for the skulls.
            let pixel_coords = (ldtk_point.as_vec2() + Vec2::new(0.5, 1.))
                * Vec2::splat(layer_instance.grid_size as f32);

            points.push(ldtk_pixel_coords_to_translation_pivoted(
                pixel_coords.as_ivec2(),
                layer_instance.c_hei * layer_instance.grid_size,
                IVec2::new(entity_instance.width, entity_instance.height),
                entity_instance.pivot,
            ));
        }

        Patrol {
            points,
            index: 1,
            forward: true,
        }
    }
}

pub fn patrol(mut query: Query<(&mut Transform, &mut Velocity, &mut Patrol)>) {
    for (mut transform, mut velocity, mut patrol) in &mut query {
        if patrol.points.len() <= 1 {
            velocity.linvel = Vec2::ZERO;
            continue;
        }
        patrol.index %= patrol.points.len();
        let delta = patrol.points[patrol.index] - transform.translation.truncate();
        if let Some(direction) = delta.try_normalize() {
            if delta.dot(velocity.linvel) >= 0. {
                velocity.linvel = direction * 75.;
                continue;
            }
        }

        // Rapier travelled along the incoming leg. Carry the distance beyond
        // its target around subsequent corners instead of discarding it.
        let mut remaining = delta.length();
        let cycle_length: f32 = patrol
            .points
            .windows(2)
            .map(|leg| leg[0].distance(leg[1]) * 2.)
            .sum();
        if cycle_length > 0. {
            remaining %= cycle_length;
        }
        let mut position = patrol.points[patrol.index];
        velocity.linvel = Vec2::ZERO;
        // Whole cycles were removed above; at most one out-and-back remains,
        // including repeated points and the completely stationary case.
        for _ in 0..2 * patrol.points.len() {
            if patrol.index == 0 {
                patrol.forward = true;
            } else if patrol.index == patrol.points.len() - 1 {
                patrol.forward = false;
            }
            if patrol.forward {
                patrol.index += 1;
            } else {
                patrol.index -= 1;
            }
            let delta = patrol.points[patrol.index] - position;
            if let Some(direction) = delta.try_normalize() {
                let distance = delta.length();
                if remaining < distance {
                    position += direction * remaining;
                    velocity.linvel = direction * 75.;
                    break;
                }
                remaining -= distance;
                position = patrol.points[patrol.index];
            }
        }
        transform.translation.x = position.x;
        transform.translation.y = position.y;
    }
}

pub struct EnemyPlugin;

impl Plugin for EnemyPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, patrol)
            // Correct physics overshoot before rendering/transform propagation.
            // Update also initializes new routes before their first physics step.
            .add_systems(
                PostUpdate,
                patrol
                    .after(bevy_rapier2d::plugin::PhysicsSet::Writeback)
                    .before(bevy::transform::TransformSystems::Propagate),
            )
            .register_ldtk_entity::<MobBundle>("Mob");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arrival_and_repeated_waypoints_stay_finite() {
        for points in [
            vec![Vec2::ZERO, Vec2::X],
            vec![Vec2::ZERO, Vec2::ZERO, Vec2::X],
            vec![Vec2::ZERO; 4],
        ] {
            let mut app = App::new();
            app.add_systems(Update, patrol);
            let entity = app
                .world_mut()
                .spawn((
                    Transform::default(),
                    Velocity::zero(),
                    Patrol {
                        points: points.clone(),
                        index: 0,
                        forward: false,
                    },
                ))
                .id();
            for _ in 0..8 {
                app.update();
                let velocity = app.world().get::<Velocity>(entity).unwrap().linvel;
                assert!(velocity.is_finite());
                assert!(app
                    .world()
                    .get::<Transform>(entity)
                    .unwrap()
                    .translation
                    .is_finite());
                assert_eq!(
                    velocity,
                    if points.iter().any(|point| *point != Vec2::ZERO) {
                        Vec2::X * 75.
                    } else {
                        Vec2::ZERO
                    }
                );
            }
        }
    }

    #[test]
    fn crossing_endpoint_preserves_residual_and_turns_back() {
        let mut app = App::new();
        app.add_systems(Update, patrol);
        let entity = app
            .world_mut()
            .spawn((
                Transform::from_xyz(11., 0., 0.),
                Velocity::linear(Vec2::X * 75.),
                Patrol {
                    points: vec![Vec2::ZERO, Vec2::X * 10.],
                    index: 1,
                    forward: true,
                },
            ))
            .id();
        app.update();
        assert_eq!(
            app.world().get::<Transform>(entity).unwrap().translation.x,
            9.
        );
        assert_eq!(
            app.world().get::<Velocity>(entity).unwrap().linvel,
            -Vec2::X * 75.
        );
    }

    #[test]
    fn rapier_patrol_preserves_travel_across_frame_partitions() {
        use bevy_rapier2d::prelude::*;
        for frames in [1, 2, 19, 38, 76] {
            let mut app = App::new();
            app.add_plugins((
                MinimalPlugins,
                TransformPlugin,
                RapierPhysicsPlugin::<NoUserData>::pixels_per_meter(100.),
                EnemyPlugin,
            ))
            .insert_resource(TimestepMode::Fixed {
                dt: 0.38 / frames as f32,
                substeps: 1,
            });
            let entity = app
                .world_mut()
                .spawn((
                    Transform::default(),
                    RigidBody::KinematicVelocityBased,
                    Collider::cuboid(0.1, 0.1),
                    Velocity::zero(),
                    Patrol {
                        points: vec![
                            Vec2::ZERO,
                            Vec2::ZERO,
                            Vec2::new(2., 0.),
                            Vec2::new(2., 3.),
                            Vec2::new(5., 3.),
                        ],
                        index: 1,
                        forward: true,
                    },
                ))
                .id();
            let stationary = app
                .world_mut()
                .spawn((
                    Transform::from_xyz(100., 100., 0.),
                    RigidBody::KinematicVelocityBased,
                    Collider::cuboid(0.1, 0.1),
                    Velocity::zero(),
                    Patrol {
                        points: vec![Vec2::splat(100.); 4],
                        index: 0,
                        forward: false,
                    },
                ))
                .id();
            for _ in 0..frames {
                app.update();
            }
            assert_eq!(
                app.world()
                    .get::<Transform>(stationary)
                    .unwrap()
                    .translation,
                Vec3::new(100., 100., 0.)
            );
            assert_eq!(
                app.world().get::<Velocity>(stationary).unwrap().linvel,
                Vec2::ZERO
            );
            // 75 * .38 = 28.5 units, one 16-unit round trip plus 12.5.
            // The return leg is vertical at x=2, y=1.5, toward the first corner.
            let position = app
                .world()
                .get::<Transform>(entity)
                .unwrap()
                .translation
                .truncate();
            assert!(
                position.abs_diff_eq(Vec2::new(2., 1.5), 0.001),
                "frames={frames}: {position:?}"
            );
            assert!(app
                .world()
                .get::<Velocity>(entity)
                .unwrap()
                .linvel
                .abs_diff_eq(-Vec2::Y * 75., 0.001));
            let route = app.world().get::<Patrol>(entity).unwrap();
            assert!(!route.forward);
            assert_eq!(route.index, 2);
            assert!(app.world().get::<RapierRigidBodyHandle>(entity).is_some());
        }
    }
}
