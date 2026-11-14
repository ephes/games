use bevy_rapier2d::rapier::geometry::CollisionEventFlags;

use super::*;
use climbing::{Climbable, Climber};
use ground_detection::{GroundDetection, GroundSensor};
use player::Player;
use std::collections::HashSet;

fn app() -> App {
    let mut app = App::new();
    app.add_message::<CollisionEvent>()
        .init_resource::<ButtonInput<KeyCode>>()
        // Reverse plugin order to exercise the declared dependencies.
        .add_plugins((
            player::PlayerPlugin,
            climbing::ClimbingPlugin,
            ground_detection::GroundDetectionPlugin,
        ));
    app
}

#[test]
fn removed_contacts_clear_ground_climbing_and_gravity() {
    for stopped in [false, true] {
        let mut app = app();
        let player = app
            .world_mut()
            .spawn((
                Player,
                Velocity::zero(),
                Climber::default(),
                GroundDetection::default(),
                GravityScale(1.),
            ))
            .id();
        app.world_mut()
            .entity_mut(player)
            .insert(Collider::cuboid(6., 14.));
        app.update();
        let sensor = assert_sensor(&mut app, player, Vec2::new(3., 2.), -14.);
        let ground = app.world_mut().spawn(Collider::cuboid(8., 8.)).id();
        let ladder = app.world_mut().spawn(Climbable).id();
        app.world_mut().write_message(CollisionEvent::Started(
            ground,
            sensor,
            CollisionEventFlags::empty(),
        ));
        app.world_mut().write_message(CollisionEvent::Started(
            player,
            ladder,
            CollisionEventFlags::empty(),
        ));
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::KeyW);
        app.update();
        assert!(
            app.world()
                .get::<GroundDetection>(player)
                .unwrap()
                .on_ground
        );
        assert!(app.world().get::<Climber>(player).unwrap().climbing);
        assert_eq!(app.world().get::<GravityScale>(player).unwrap().0, 0.);
        app.world_mut().despawn(ground);
        app.world_mut().despawn(ladder);
        if stopped {
            app.world_mut().write_message(CollisionEvent::Stopped(
                sensor,
                ground,
                CollisionEventFlags::empty(),
            ));
            app.world_mut().write_message(CollisionEvent::Stopped(
                ladder,
                player,
                CollisionEventFlags::empty(),
            ));
        }
        app.update();
        assert!(app
            .world()
            .get::<GroundSensor>(sensor)
            .unwrap()
            .intersecting_ground_entities
            .is_empty());
        assert!(
            !app.world()
                .get::<GroundDetection>(player)
                .unwrap()
                .on_ground
        );
        let climber = app.world().get::<Climber>(player).unwrap();
        assert!(climber.intersecting_climbables.is_empty());
        assert!(!climber.climbing);
        assert_eq!(app.world().get::<GravityScale>(player).unwrap().0, 1.);
    }
}

#[test]
fn landing_allows_jump_in_the_observation_update() {
    for _ in 0..16 {
        let mut app = app();
        let player = app
            .world_mut()
            .spawn((
                Player,
                Velocity::zero(),
                Climber::default(),
                GroundDetection::default(),
                GravityScale(1.),
            ))
            .id();
        app.world_mut()
            .entity_mut(player)
            .insert(Collider::cuboid(6., 14.));
        app.update();
        let sensor = assert_sensor(&mut app, player, Vec2::new(3., 2.), -14.);
        let ground = app.world_mut().spawn(Collider::cuboid(8., 8.)).id();
        app.world_mut().write_message(CollisionEvent::Started(
            sensor,
            ground,
            CollisionEventFlags::empty(),
        ));
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Space);
        app.update();
        assert_eq!(app.world().get::<Velocity>(player).unwrap().linvel.y, 500.);
    }
}

#[test]
fn ladder_up_keys_share_climb_precedence_and_space_exits() {
    for grounded in [false, true] {
        for up in [KeyCode::KeyW, KeyCode::ArrowUp] {
            for jump in [false, true] {
                let mut app = app();
                let ladder = app.world_mut().spawn(Climbable).id();
                let player = app
                    .world_mut()
                    .spawn((
                        Player,
                        Velocity::linear(Vec2::new(0., -25.)),
                        Climber {
                            climbing: false,
                            intersecting_climbables: HashSet::from([ladder]),
                        },
                        GroundDetection {
                            on_ground: grounded,
                        },
                        GravityScale(1.),
                    ))
                    .id();
                app.world_mut()
                    .resource_mut::<ButtonInput<KeyCode>>()
                    .press(up);
                if jump {
                    app.world_mut()
                        .resource_mut::<ButtonInput<KeyCode>>()
                        .press(KeyCode::Space);
                }
                app.update();
                assert_eq!(
                    app.world().get::<Climber>(player).unwrap().climbing,
                    !jump,
                    "up={up:?}, grounded={grounded}, jump={jump}"
                );
                assert_eq!(
                    app.world().get::<Velocity>(player).unwrap().linvel.y,
                    if jump { 500. } else { 200. }
                );
                assert_eq!(
                    app.world().get::<GravityScale>(player).unwrap().0,
                    if jump { 1. } else { 0. }
                );
                // Holding up after a deliberate jump must not immediately re-enter.
                app.world_mut()
                    .resource_mut::<ButtonInput<KeyCode>>()
                    .clear();
                app.update();
                assert_eq!(app.world().get::<Climber>(player).unwrap().climbing, !jump);
            }
        }
    }
}

#[test]
fn up_away_from_ladders_only_jumps_from_ground() {
    for grounded in [false, true] {
        for key in [KeyCode::KeyW, KeyCode::ArrowUp, KeyCode::Space] {
            let mut app = app();
            let player = app
                .world_mut()
                .spawn((
                    Player,
                    Velocity::linear(Vec2::new(0., -25.)),
                    Climber::default(),
                    GroundDetection {
                        on_ground: grounded,
                    },
                    GravityScale(1.),
                ))
                .id();
            app.world_mut()
                .resource_mut::<ButtonInput<KeyCode>>()
                .press(key);
            app.update();
            assert!(!app.world().get::<Climber>(player).unwrap().climbing);
            assert_eq!(app.world().get::<GravityScale>(player).unwrap().0, 1.);
            assert_eq!(
                app.world().get::<Velocity>(player).unwrap().linvel.y,
                if grounded && key != KeyCode::KeyW {
                    500.
                } else {
                    -25.
                }
            );
        }
    }
}

#[test]
fn removed_ground_components_retire_sensors_and_queued_contacts() {
    for (remove_collider, immediate_reinsert) in [(true, false), (false, false), (false, true)] {
        let mut app = App::new();
        app.add_plugins((
            MinimalPlugins,
            TransformPlugin,
            RapierPhysicsPlugin::<NoUserData>::pixels_per_meter(100.),
            ground_detection::GroundDetectionPlugin,
            player::PlayerPlugin,
        ))
        .init_resource::<ButtonInput<KeyCode>>()
        .insert_resource(TimestepMode::Fixed {
            dt: 1. / 60.,
            substeps: 1,
        });
        let player = app
            .world_mut()
            .spawn((
                Player,
                Climber::default(),
                GroundDetection::default(),
                GravityScale(0.),
                Velocity::zero(),
                RigidBody::KinematicVelocityBased,
                Collider::cuboid(6., 14.),
                Transform::from_xyz(0., 20., 0.),
            ))
            .id();
        let floor = app
            .world_mut()
            .spawn((
                RigidBody::Fixed,
                ActiveCollisionTypes::all(),
                Collider::cuboid(20., 2.),
                Transform::from_xyz(0., 4., 0.),
            ))
            .id();
        for _ in 0..6 {
            app.update();
        }
        assert!(
            app.world()
                .get::<GroundDetection>(player)
                .unwrap()
                .on_ground
        );
        let old = assert_sensor(&mut app, player, Vec2::new(3., 2.), -14.);
        if remove_collider {
            app.world_mut().entity_mut(player).remove::<Collider>();
        } else {
            app.world_mut()
                .entity_mut(player)
                .remove::<GroundDetection>();
            if immediate_reinsert {
                app.world_mut()
                    .entity_mut(player)
                    .insert(GroundDetection::default());
            }
        }
        app.world_mut().write_message(CollisionEvent::Started(
            old,
            floor,
            CollisionEventFlags::empty(),
        ));
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Space);
        app.update();
        assert!(app.world().get_entity(old).is_err());
        if !immediate_reinsert {
            assert_eq!(
                app.world_mut()
                    .query::<&GroundSensor>()
                    .iter(app.world())
                    .count(),
                0
            );
            if !remove_collider {
                app.world_mut()
                    .entity_mut(player)
                    .insert(GroundDetection::default());
            }
            app.world_mut().write_message(CollisionEvent::Started(
                old,
                floor,
                CollisionEventFlags::empty(),
            ));
            app.update();
        }
        if !remove_collider {
            let new = assert_sensor(&mut app, player, Vec2::new(3., 2.), -14.);
            assert_ne!(old, new);
            assert!(app
                .world()
                .get::<GroundSensor>(new)
                .unwrap()
                .intersecting_ground_entities
                .is_empty());
        }
        assert!(
            !app.world()
                .get::<GroundDetection>(player)
                .unwrap()
                .on_ground
        );
        assert_eq!(app.world().get::<Velocity>(player).unwrap().linvel.y, 0.);
    }
}

#[test]
fn live_collider_replacement_refreshes_ground_contacts_and_jump_eligibility() {
    let mut app = App::new();
    app.add_plugins((
        MinimalPlugins,
        TransformPlugin,
        RapierPhysicsPlugin::<NoUserData>::pixels_per_meter(100.),
        ground_detection::GroundDetectionPlugin,
        player::PlayerPlugin,
    ))
    .init_resource::<ButtonInput<KeyCode>>()
    .insert_resource(TimestepMode::Fixed {
        dt: 1. / 60.,
        substeps: 1,
    });
    let player = app
        .world_mut()
        .spawn((
            Player,
            Climber::default(),
            GroundDetection::default(),
            GravityScale(0.),
            Velocity::zero(),
            RigidBody::KinematicVelocityBased,
            Collider::cuboid(6., 14.),
            Transform::from_xyz(0., 20., 0.),
        ))
        .id();
    app.world_mut().spawn((
        RigidBody::Fixed,
        ActiveCollisionTypes::all(),
        Collider::cuboid(20., 2.),
        Transform::from_xyz(0., 4., 0.),
    ));
    for _ in 0..6 {
        app.update();
    }
    assert!(
        app.world()
            .get::<GroundDetection>(player)
            .unwrap()
            .on_ground
    );
    let original = assert_sensor(&mut app, player, Vec2::new(3., 2.), -14.);
    app.world_mut()
        .entity_mut(player)
        .insert(Collider::cuboid(6., 14.));
    app.update();
    assert_eq!(
        assert_sensor(&mut app, player, Vec2::new(3., 2.), -14.),
        original
    );
    assert!(
        app.world()
            .get::<GroundDetection>(player)
            .unwrap()
            .on_ground
    );

    app.world_mut()
        .entity_mut(player)
        .insert(Collider::cuboid(10., 6.));
    app.update();
    let resized = assert_sensor(&mut app, player, Vec2::new(5., 2.), -6.);
    assert_ne!(original, resized);
    assert!(app.world().get_entity(original).is_err());
    assert!(
        !app.world()
            .get::<GroundDetection>(player)
            .unwrap()
            .on_ground
    );
    assert!(app
        .world()
        .get::<GroundSensor>(resized)
        .unwrap()
        .intersecting_ground_entities
        .is_empty());
    for _ in 0..6 {
        app.update();
    }
    assert_eq!(
        assert_sensor(&mut app, player, Vec2::new(5., 2.), -6.),
        resized
    );
    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .press(KeyCode::Space);
    app.update();
    assert_eq!(app.world().get::<Velocity>(player).unwrap().linvel.y, 0.);
    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .reset_all();

    // Only a new real overlap at the resized foot makes jumping available.
    let raised_ground = app
        .world_mut()
        .spawn((
            RigidBody::Fixed,
            ActiveCollisionTypes::all(),
            Collider::cuboid(20., 1.),
            Transform::from_xyz(0., 12., 0.),
        ))
        .id();
    for _ in 0..6 {
        app.update();
    }
    assert!(
        app.world()
            .get::<GroundDetection>(player)
            .unwrap()
            .on_ground
    );
    assert!(app
        .world()
        .get::<GroundSensor>(resized)
        .unwrap()
        .intersecting_ground_entities
        .contains(&raised_ground));
    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .press(KeyCode::Space);
    app.update();
    assert_eq!(app.world().get::<Velocity>(player).unwrap().linvel.y, 500.);
    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .reset_all();

    app.world_mut().entity_mut(player).insert((
        Collider::ball(8.),
        Velocity::zero(),
        Transform::from_xyz(0., 20., 0.),
    ));
    app.update();
    assert!(
        !app.world()
            .get::<GroundDetection>(player)
            .unwrap()
            .on_ground
    );
    assert_eq!(
        app.world_mut()
            .query::<&GroundSensor>()
            .iter(app.world())
            .count(),
        0
    );
    for _ in 0..3 {
        app.update();
    }
    assert!(
        !app.world()
            .get::<GroundDetection>(player)
            .unwrap()
            .on_ground
    );
    app.world_mut()
        .entity_mut(player)
        .insert(Collider::cuboid(6., 14.));
    for _ in 0..6 {
        app.update();
    }
    assert_sensor(&mut app, player, Vec2::new(3., 2.), -14.);
    assert!(
        app.world()
            .get::<GroundDetection>(player)
            .unwrap()
            .on_ground
    );
}

fn assert_sensor(app: &mut App, player: Entity, half_extents: Vec2, y: f32) -> Entity {
    let (entity, sensor, collider, transform, parent) = app
        .world_mut()
        .query::<(Entity, &GroundSensor, &Collider, &Transform, &ChildOf)>()
        .single(app.world())
        .unwrap();
    assert_eq!(sensor.ground_detection_entity, player);
    assert_eq!(parent.parent(), player);
    assert_eq!(collider.as_cuboid().unwrap().half_extents(), half_extents);
    assert_eq!(transform.translation, Vec3::new(0., y, 0.));
    entity
}
