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
        let sensor = app
            .world_mut()
            .spawn(GroundSensor {
                ground_detection_entity: player,
                intersecting_ground_entities: HashSet::new(),
            })
            .id();
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
        let sensor = app
            .world_mut()
            .spawn(GroundSensor {
                ground_detection_entity: player,
                intersecting_ground_entities: HashSet::new(),
            })
            .id();
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
