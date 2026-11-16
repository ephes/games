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
    points: Vec<Vec2>,
    cycle_length: f32,
    pub index: usize,
    pub forward: bool,
}

impl Patrol {
    fn new(points: Vec<Vec2>, index: usize, forward: bool) -> Self {
        let cycle_length: f32 = points
            .windows(2)
            .map(|leg| patrol_leg_distance(leg[0], leg[1]) * 2.)
            .sum();
        // Keep route geometry and its metric together; replacement constructs a
        // fresh Patrol, while ticks may mutate only the traversal cursor.
        if !cycle_length.is_finite() || points.iter().any(|point| !point.is_finite()) {
            warn!("Invalid patrol metric; using stationary patrol");
            return Self::new(
                points
                    .into_iter()
                    .filter(|point| point.is_finite())
                    .take(1)
                    .collect(),
                0,
                true,
            );
        }
        Self {
            points,
            cycle_length,
            index,
            forward,
        }
    }

    pub fn points(&self) -> &[Vec2] {
        &self.points
    }
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
        // Check both extents before invoking LDtk's signed coordinate helper.
        let pixel_height =
            (layer_instance.c_wid > 0 && layer_instance.c_hei > 0 && layer_instance.grid_size > 0)
                .then(|| {
                    layer_instance.c_wid.checked_mul(layer_instance.grid_size)?;
                    layer_instance.c_hei.checked_mul(layer_instance.grid_size)
                })
                .flatten();
        let spawn = pixel_height
            .and_then(|height| patrol_position(entity_instance, height, entity_instance.px));
        let admitted = (|| {
            let mut points = vec![spawn.ok_or("invalid layer or spawn geometry")?];
            let height = pixel_height.unwrap();
            let route = entity_instance
                .iter_points_field("patrol")
                .map_err(|_| "missing or malformed patrol points")?;
            for point in route {
                // Preserve the sample world's half-cell X / full-cell Y pivot
                // adjustment in widened integer arithmetic, before f32 conversion.
                let grid = i64::from(layer_instance.grid_size);
                let x = (2 * i64::from(point.x) + 1) * grid / 2;
                let y = (i64::from(point.y) + 1) * grid;
                let px = IVec2::new(
                    i32::try_from(x).map_err(|_| "patrol X exceeds signed pixel coordinates")?,
                    i32::try_from(y).map_err(|_| "patrol Y exceeds signed pixel coordinates")?,
                );
                points.push(
                    patrol_position(entity_instance, height, px)
                        .ok_or("invalid patrol coordinate conversion")?,
                );
            }
            points.dedup();
            Ok::<_, &str>(points)
        })();
        match admitted {
            Ok(points) => {
                let index = usize::from(points.len() > 1);
                Patrol::new(points, index, true)
            }
            Err(error) => {
                warn!(
                    "Invalid patrol on entity {}: {error}; using stationary patrol",
                    entity_instance.iid
                );
                Patrol::new(spawn.into_iter().collect(), 0, true)
            }
        }
    }
}

fn patrol_position(entity: &EntityInstance, height: i32, px: IVec2) -> Option<Vec2> {
    if entity.width <= 0 || entity.height <= 0 || !entity.pivot.is_finite() {
        return None;
    }
    height.checked_sub(px.y)?;
    let position = ldtk_pixel_coords_to_translation_pivoted(
        px,
        height,
        IVec2::new(entity.width, entity.height),
        entity.pivot,
    );
    position.is_finite().then_some(position)
}

#[cfg(test)]
thread_local! {
    static DISTANCE_EVALUATIONS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

fn patrol_leg_distance(a: Vec2, b: Vec2) -> f32 {
    #[cfg(test)]
    DISTANCE_EVALUATIONS.with(|count| count.set(count.get() + 1));
    a.distance(b)
}

// Avoid partition-dependent direction at an endpoint due to f32 physics drift.
const WAYPOINT_EPSILON: f32 = 0.0001;

pub fn patrol(mut query: Query<(&mut Transform, &mut Velocity, &mut Patrol)>) {
    for (mut transform, mut velocity, mut patrol) in &mut query {
        if patrol.points().len() <= 1 {
            velocity.linvel = Vec2::ZERO;
            continue;
        }
        patrol.index %= patrol.points.len();
        let delta = patrol.points[patrol.index] - transform.translation.truncate();
        if let Some(direction) = delta.try_normalize() {
            if delta.length() > WAYPOINT_EPSILON && delta.dot(velocity.linvel) >= 0. {
                velocity.linvel = direction * 75.;
                continue;
            }
        }

        // Rapier travelled along the incoming leg. Carry the distance beyond
        // its target around subsequent corners instead of discarding it.
        let mut remaining = if delta.dot(velocity.linvel) < 0. {
            delta.length()
        } else {
            0.
        };
        let cycle_length = patrol.cycle_length;
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
                if remaining + WAYPOINT_EPSILON < distance {
                    position += direction * remaining;
                    velocity.linvel = direction * 75.;
                    break;
                }
                remaining = (remaining - distance).max(0.);
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
    use bevy::log::{
        tracing,
        tracing_subscriber::{self, prelude::*},
    };
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    struct Warnings(Arc<AtomicUsize>);
    impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for Warnings {
        fn on_event(
            &self,
            event: &tracing::Event<'_>,
            _: tracing_subscriber::layer::Context<'_, S>,
        ) {
            if *event.metadata().level() == tracing::Level::WARN {
                self.0.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    fn authored_route(
        layer: &LayerInstance,
        points: Vec<IVec2>,
        expected_warnings: usize,
    ) -> Patrol {
        let (app, _) = crate::testing::project_app(vec![]);
        let entity = EntityInstance {
            iid: "synthetic-mob".into(),
            px: IVec2::new(8, 16),
            width: 10,
            height: 10,
            pivot: Vec2::splat(0.5),
            field_instances: vec![bevy_ecs_ldtk::ldtk::FieldInstance {
                identifier: "patrol".into(),
                value: FieldValue::Points(points.into_iter().map(Some).collect()),
                field_instance_type: "Array<Point>".into(),
                tile: None,
                def_uid: 7,
                real_editor_values: vec![],
            }],
            ..default()
        };
        let count = Arc::new(AtomicUsize::new(0));
        let subscriber = tracing_subscriber::registry().with(Warnings(count.clone()));
        let route = tracing::subscriber::with_default(subscriber, || {
            Patrol::bundle_entity(
                &entity,
                layer,
                None,
                None,
                app.world().resource::<AssetServer>(),
                &mut Assets::default(),
            )
        });
        assert_eq!(count.load(Ordering::Relaxed), expected_warnings);
        route
    }

    fn authored_layer() -> LayerInstance {
        LayerInstance {
            c_wid: 8,
            c_hei: 8,
            grid_size: 16,
            ..default()
        }
    }

    #[test]
    fn unchanged_authored_routes_reuse_cycle_metrics() {
        for count in [100, 1000] {
            let route = authored_route(
                &authored_layer(),
                (1..count).map(|x| IVec2::new(x, 0)).collect(),
                0,
            );
            let mut app = App::new();
            app.add_systems(Update, patrol);
            let id = app
                .world_mut()
                .spawn((Transform::default(), Velocity::zero(), route))
                .id();
            DISTANCE_EVALUATIONS.with(|count| count.set(0));
            for _ in 0..20 {
                let route = app.world().get::<Patrol>(id).unwrap();
                let target = route.points[route.index];
                app.world_mut()
                    .get_mut::<Transform>(id)
                    .unwrap()
                    .translation = target.extend(0.);
                app.world_mut().get_mut::<Velocity>(id).unwrap().linvel = Vec2::ZERO;
                app.update();
            }
            assert_eq!(
                DISTANCE_EVALUATIONS.with(|count| count.get()),
                0,
                "unchanged route of {count} points rescanned"
            );
        }
    }

    #[test]
    fn replacing_route_replaces_cycle_metric_and_preserves_residual() {
        let mut app = App::new();
        app.add_systems(Update, patrol);
        let id = app
            .world_mut()
            .spawn((
                Transform::default(),
                Velocity::zero(),
                Patrol::new(vec![Vec2::ZERO, Vec2::X * 10.], 1, true),
            ))
            .id();
        app.update();
        app.world_mut()
            .entity_mut(id)
            .insert(Patrol::new(vec![Vec2::ZERO, Vec2::X * 3.], 1, true));
        app.world_mut()
            .get_mut::<Transform>(id)
            .unwrap()
            .translation
            .x = 31.;
        app.world_mut().get_mut::<Velocity>(id).unwrap().linvel = Vec2::X * 75.;
        app.update();
        // 31 units along a length-3 out-and-back: five cycles, then one unit outbound.
        assert_eq!(app.world().get::<Transform>(id).unwrap().translation.x, 1.);
        assert_eq!(
            app.world().get::<Velocity>(id).unwrap().linvel,
            Vec2::X * 75.
        );
        assert_eq!(app.world().get::<Patrol>(id).unwrap().index, 1);
    }

    #[test]
    fn authored_patrol_refuses_overflow_without_moving_or_blocking_siblings() {
        for (width, height, grid, point) in [
            (8, i32::MAX, 16, IVec2::ZERO),
            (i32::MAX, 8, 16, IVec2::ZERO),
            (0, 8, 16, IVec2::ZERO),
            (8, -1, 16, IVec2::ZERO),
            (8, 8, 0, IVec2::ZERO),
            (8, 8, 16, IVec2::new(i32::MAX, 0)),
            (8, 8, 16, IVec2::new(0, i32::MIN)),
            (8, 8, 16, IVec2::new(0, i32::MAX)),
        ] {
            let layer = LayerInstance {
                c_wid: width,
                c_hei: height,
                grid_size: grid,
                ..default()
            };
            let route = authored_route(&layer, vec![IVec2::ZERO, point], 1);
            assert!(route.points.len() <= 1, "{layer:?}: {route:?}");
            let mut app = App::new();
            app.add_systems(Update, patrol);
            let id = app
                .world_mut()
                .spawn((
                    Transform::from_xyz(8., 112., 0.),
                    Velocity::linear(Vec2::X),
                    route,
                ))
                .id();
            app.update();
            assert_eq!(app.world().get::<Velocity>(id).unwrap().linvel, Vec2::ZERO);
            assert_eq!(
                app.world().get::<Transform>(id).unwrap().translation,
                Vec3::new(8., 112., 0.)
            );
            let sibling = authored_route(&authored_layer(), vec![IVec2::new(6, 1)], 0);
            assert_eq!(
                sibling.points,
                vec![Vec2::new(8., 112.), Vec2::new(104., 96.)]
            );
        }
    }

    #[test]
    fn authored_patrol_converts_before_float_rounding() {
        let layer = LayerInstance {
            c_wid: 1,
            c_hei: 64,
            grid_size: 2,
            ..default()
        };
        let route = authored_route(&layer, vec![IVec2::new(16_777_217, 1)], 0);
        assert_eq!(route.points[1], Vec2::new(33_554_435_i32 as f32, 124.));
    }

    #[test]
    fn authored_patrol_accepts_checked_coordinate_boundaries() {
        let layer = LayerInstance {
            c_wid: 1,
            c_hei: 1,
            grid_size: 1,
            ..default()
        };
        let route = authored_route(&layer, vec![IVec2::new(i32::MAX, i32::MIN + 1)], 0);
        assert_eq!(route.points[1], Vec2::splat(i32::MAX as f32));
        assert!(patrol_position(
            &EntityInstance {
                width: 10,
                height: 10,
                pivot: Vec2::splat(f32::NAN),
                ..default()
            },
            1,
            IVec2::ZERO
        )
        .is_none());
    }

    #[test]
    fn authored_repeated_waypoints_collapse_once() {
        let route = authored_route(&authored_layer(), vec![IVec2::ZERO; 50_000], 0);
        assert_eq!(route.points.len(), 1);
        assert_eq!(route.points[0], Vec2::new(8., 112.));
        let mut app = App::new();
        app.add_systems(Update, patrol);
        let id = app
            .world_mut()
            .spawn((Transform::from_xyz(8., 112., 0.), Velocity::zero(), route))
            .id();
        for _ in 0..10 {
            app.update();
            assert_eq!(app.world().get::<Patrol>(id).unwrap().points.len(), 1);
            assert_eq!(app.world().get::<Velocity>(id).unwrap().linvel, Vec2::ZERO);
        }
    }

    #[test]
    fn authored_revisits_preserve_partitioned_travel() {
        use bevy_rapier2d::prelude::*;
        for frames in [1, 2, 19, 38, 76] {
            let route = authored_route(
                &authored_layer(),
                vec![IVec2::ZERO, IVec2::X, IVec2::X, IVec2::ZERO],
                0,
            );
            assert_eq!(
                route.points,
                vec![
                    Vec2::new(8., 112.),
                    Vec2::new(24., 112.),
                    Vec2::new(8., 112.)
                ]
            );
            let mut app = App::new();
            app.add_plugins((
                MinimalPlugins,
                TransformPlugin,
                RapierPhysicsPlugin::<NoUserData>::pixels_per_meter(100.),
                EnemyPlugin,
            ))
            .insert_resource(TimestepMode::Fixed {
                dt: 24. / 75. / frames as f32,
                substeps: 1,
            });
            let id = app
                .world_mut()
                .spawn((
                    Transform::from_xyz(8., 112., 0.),
                    RigidBody::KinematicVelocityBased,
                    Velocity::zero(),
                    route,
                ))
                .id();
            for _ in 0..frames {
                app.update();
            }
            assert!(app
                .world()
                .get::<Transform>(id)
                .unwrap()
                .translation
                .abs_diff_eq(Vec3::new(16., 112., 0.), 0.001));
            assert_eq!(
                app.world().get::<Velocity>(id).unwrap().linvel,
                -Vec2::X * 75.
            );
        }
    }

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
                    Patrol::new(points.clone(), 0, false),
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
                Patrol::new(vec![Vec2::ZERO, Vec2::X * 10.], 1, true),
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
        for (distance, expected, direction, forward, index) in [
            (28.5, Vec2::new(2., 1.5), -Vec2::Y, false, 2),
            (8., Vec2::new(5., 3.), -Vec2::X, false, 3),
            (16., Vec2::ZERO, Vec2::X, true, 2),
        ] {
            for frames in [1, 2, 19, 38, 76] {
                let mut app = App::new();
                app.add_plugins((
                    MinimalPlugins,
                    TransformPlugin,
                    RapierPhysicsPlugin::<NoUserData>::pixels_per_meter(100.),
                    EnemyPlugin,
                ))
                .insert_resource(TimestepMode::Fixed {
                    dt: distance / 75. / frames as f32,
                    substeps: 1,
                });
                let entity = app
                    .world_mut()
                    .spawn((
                        Transform::default(),
                        RigidBody::KinematicVelocityBased,
                        Collider::cuboid(0.1, 0.1),
                        Velocity::zero(),
                        Patrol::new(
                            vec![
                                Vec2::ZERO,
                                Vec2::ZERO,
                                Vec2::new(2., 0.),
                                Vec2::new(2., 3.),
                                Vec2::new(5., 3.),
                            ],
                            1,
                            true,
                        ),
                    ))
                    .id();
                let stationary = app
                    .world_mut()
                    .spawn((
                        Transform::from_xyz(100., 100., 0.),
                        RigidBody::KinematicVelocityBased,
                        Collider::cuboid(0.1, 0.1),
                        Velocity::zero(),
                        Patrol::new(vec![Vec2::splat(100.); 4], 0, false),
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
                // Independent arc-length oracle: outbound legs have lengths 2, 3, 3.
                // 28.5 units returns vertically after a full 16-unit cycle;
                // 8 and 16 units land on the two turnaround points.
                let position = app
                    .world()
                    .get::<Transform>(entity)
                    .unwrap()
                    .translation
                    .truncate();
                assert!(
                    position.abs_diff_eq(expected, 0.001),
                    "distance={distance}, frames={frames}: {position:?}"
                );
                assert!(
                    app.world()
                        .get::<Velocity>(entity)
                        .unwrap()
                        .linvel
                        .abs_diff_eq(direction * 75., 0.001),
                    "distance={distance}, frames={frames}, position={position:?}, velocity={:?}",
                    app.world().get::<Velocity>(entity).unwrap().linvel
                );
                let route = app.world().get::<Patrol>(entity).unwrap();
                assert_eq!(
                    route.forward, forward,
                    "distance={distance}, frames={frames}"
                );
                assert_eq!(route.index, index);
                assert!(app.world().get::<RapierRigidBodyHandle>(entity).is_some());
            }
        }
    }
}
