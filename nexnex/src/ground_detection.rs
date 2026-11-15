use std::collections::{HashMap, HashSet};

use bevy::ecs::message::MessageReader;
use bevy::prelude::*;

use bevy_rapier2d::prelude::*;

#[derive(Component)]
pub struct GroundSensor {
    pub ground_detection_entity: Entity,
    pub intersecting_ground_entities: HashSet<Entity>,
}

impl GroundSensor {
    fn owner(&self) -> Entity {
        #[cfg(test)]
        OWNER_PROBES.with(|probes| probes.set(probes.get() + 1));
        self.ground_detection_entity
    }
}

#[cfg(test)]
thread_local! {
    static OWNER_PROBES: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

#[derive(Clone, Default, Component)]
pub struct GroundDetection {
    pub on_ground: bool,
}

/// Retire sensor identities before consuming queued physics messages, including
/// removal followed by reinsertion in the same frame.
pub fn retire_ground_sensors(
    mut commands: Commands,
    mut removed_colliders: RemovedComponents<Collider>,
    mut removed_detectors: RemovedComponents<GroundDetection>,
    owners: Query<Entity, (With<Collider>, With<GroundDetection>)>,
    sensors: Query<(Entity, &GroundSensor)>,
    mut detectors: Query<&mut GroundDetection>,
) {
    let mut removed: HashSet<_> = removed_colliders.read().collect();
    for owner in &removed {
        // Rapier only detects missing Collider components at backend sync. If
        // removal and reinsertion happen before it, explicitly retire the old
        // handle so the replacement and its fresh sensor share a new lifetime.
        if let Ok(mut entity) = commands.get_entity(*owner) {
            entity.remove::<RapierColliderHandle>();
        }
    }
    removed.extend(removed_detectors.read());
    for owner in &removed {
        if let Ok(mut detector) = detectors.get_mut(*owner) {
            detector.on_ground = false;
        }
    }
    for (entity, sensor) in &sensors {
        let owner = sensor.ground_detection_entity;
        if removed.contains(&owner) || !owners.contains(owner) {
            commands.entity(entity).despawn();
            if let Ok(mut detector) = detectors.get_mut(owner) {
                detector.on_ground = false;
            }
        }
    }
}

#[allow(clippy::type_complexity)]
pub fn spawn_ground_sensor(
    mut commands: Commands,
    mut detect_ground_for: Query<
        (Entity, &Collider, &mut GroundDetection),
        Or<(Added<GroundDetection>, Changed<Collider>)>,
    >,
    sensors: Query<(Entity, &GroundSensor, Option<&Collider>, Option<&Transform>)>,
) {
    if detect_ground_for.is_empty() {
        return;
    }
    let mut by_owner: HashMap<_, Vec<_>> = HashMap::new();
    for sensor in &sensors {
        by_owner.entry(sensor.1.owner()).or_default().push(sensor);
    }
    for (entity, shape, mut ground_detection) in &mut detect_ground_for {
        let geometry = shape.as_cuboid().map(|cuboid| {
            let half_extents = cuboid.half_extents();
            (
                Vec2::new(half_extents.x / 2., 2.),
                Vec3::new(0., -half_extents.y, 0.),
            )
        });
        let owned = by_owner.remove(&entity).unwrap_or_default();
        if let Some((extents, translation)) = geometry {
            if owned.len() == 1 {
                let (_, _, collider, transform) = owned[0];
                if collider
                    .and_then(Collider::as_cuboid)
                    .is_some_and(|shape| shape.half_extents() == extents)
                    && transform.is_some_and(|transform| transform.translation == translation)
                {
                    continue;
                }
            }
        }
        // Retire the old collider entity, so queued collision messages for it
        // cannot repopulate contacts belonging to the replacement geometry.
        for (sensor, _, _, _) in owned {
            commands.entity(sensor).despawn();
        }
        ground_detection.on_ground = false;
        if let Some((extents, translation)) = geometry {
            commands.entity(entity).with_children(|builder| {
                builder.spawn((
                    ActiveEvents::COLLISION_EVENTS,
                    Collider::cuboid(extents.x, extents.y),
                    Sensor,
                    Transform::from_translation(translation),
                    GlobalTransform::default(),
                    GroundSensor {
                        ground_detection_entity: entity,
                        intersecting_ground_entities: HashSet::new(),
                    },
                ));
            });
        } else {
            warn!("Ground detection requires a cuboid collider on {entity:?}; leaving ungrounded");
        }
    }
}

pub fn ground_detection(
    mut ground_sensors: Query<&mut GroundSensor>,
    mut collisions: MessageReader<CollisionEvent>,
    collidables: Query<Entity, (With<Collider>, Without<Sensor>)>,
) {
    for collision_event in collisions.read() {
        match collision_event.to_owned() {
            CollisionEvent::Started(e1, e2, _) => {
                if collidables.contains(e1) {
                    if let Ok(mut sensor) = ground_sensors.get_mut(e2) {
                        sensor.intersecting_ground_entities.insert(e1);
                    }
                } else if collidables.contains(e2) {
                    if let Ok(mut sensor) = ground_sensors.get_mut(e1) {
                        sensor.intersecting_ground_entities.insert(e2);
                    }
                }
            }
            CollisionEvent::Stopped(e1, e2, _) => {
                if let Ok(mut sensor) = ground_sensors.get_mut(e2) {
                    sensor.intersecting_ground_entities.remove(&e1);
                }
                if let Ok(mut sensor) = ground_sensors.get_mut(e1) {
                    sensor.intersecting_ground_entities.remove(&e2);
                }
            }
        }
    }
    for mut sensor in &mut ground_sensors {
        sensor
            .intersecting_ground_entities
            .retain(|entity| collidables.contains(*entity));
    }
}

pub fn update_on_ground(
    mut ground_detectors: Query<&mut GroundDetection>,
    ground_sensors: Query<&GroundSensor, Changed<GroundSensor>>,
) {
    for sensor in &ground_sensors {
        if let Ok(mut ground_detection) = ground_detectors.get_mut(sensor.ground_detection_entity) {
            ground_detection.on_ground = !sensor.intersecting_ground_entities.is_empty();
        }
    }
}

/// Handles platformer-specific physics operations, specifically ground detection.
pub struct GroundDetectionPlugin;

impl Plugin for GroundDetectionPlugin {
    fn build(&self, app: &mut App) {
        app.configure_sets(
            Update,
            (
                crate::ControlSet::Observe,
                crate::ControlSet::Grounded,
                crate::ControlSet::Movement,
                crate::ControlSet::Gravity,
            )
                .chain(),
        )
        .add_systems(
            Update,
            (retire_ground_sensors, spawn_ground_sensor)
                .chain()
                .before(crate::ControlSet::Observe),
        )
        .add_systems(Update, ground_detection.in_set(crate::ControlSet::Observe))
        .add_systems(Update, update_on_ground.in_set(crate::ControlSet::Grounded));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy_rapier2d::rapier::geometry::CollisionEventFlags;

    #[test]
    fn simultaneous_detector_changes_use_linear_owner_inventory() {
        for count in [1, 100, 1000] {
            let mut app = App::new();
            app.add_systems(Update, spawn_ground_sensor);
            let owners: Vec<_> = (0..count)
                .map(|_| {
                    app.world_mut()
                        .spawn((Collider::cuboid(6., 14.), GroundDetection::default()))
                        .id()
                })
                .collect();
            app.update();
            let original: Vec<_> = app
                .world_mut()
                .query::<(Entity, &GroundSensor)>()
                .iter(app.world())
                .map(|(id, sensor)| (id, sensor.ground_detection_entity))
                .collect();
            assert_eq!(original.len(), count);
            let floor = app.world_mut().spawn_empty().id();
            for &(sensor, _) in &original {
                app.world_mut()
                    .get_mut::<GroundSensor>(sensor)
                    .unwrap()
                    .intersecting_ground_entities
                    .insert(floor);
            }
            for &owner in &owners {
                app.world_mut()
                    .entity_mut(owner)
                    .insert(Collider::cuboid(6., 14.));
                app.world_mut()
                    .get_mut::<GroundDetection>(owner)
                    .unwrap()
                    .on_ground = true;
            }
            OWNER_PROBES.with(|probes| probes.set(0));
            app.update();
            assert_eq!(OWNER_PROBES.with(|probes| probes.get()), count);
            // Equal geometry preserves identities and grounding.
            for &(id, owner) in &original {
                assert_eq!(
                    app.world()
                        .get::<GroundSensor>(id)
                        .unwrap()
                        .intersecting_ground_entities,
                    HashSet::from([floor])
                );
                assert!(app.world().get::<GroundDetection>(owner).unwrap().on_ground);
                app.world_mut()
                    .entity_mut(owner)
                    .insert(Collider::cuboid(10., 20.));
            }
            OWNER_PROBES.with(|probes| probes.set(0));
            app.update();
            assert_eq!(OWNER_PROBES.with(|probes| probes.get()), count);
            for &(id, owner) in &original {
                assert!(app.world().get_entity(id).is_err());
                assert!(!app.world().get::<GroundDetection>(owner).unwrap().on_ground);
            }
            let mut seen = HashSet::new();
            for (sensor, collider, transform) in app
                .world_mut()
                .query::<(&GroundSensor, &Collider, &Transform)>()
                .iter(app.world())
            {
                assert!(seen.insert(sensor.ground_detection_entity));
                assert!(sensor.intersecting_ground_entities.is_empty());
                assert_eq!(
                    collider.as_cuboid().unwrap().half_extents(),
                    Vec2::new(5., 2.)
                );
                assert_eq!(transform.translation, Vec3::new(0., -20., 0.));
            }
            assert_eq!(seen.len(), count);
        }
    }

    #[test]
    fn collider_removed_and_reinserted_before_update_retires_contact_identity() {
        let mut app = App::new();
        app.add_message::<CollisionEvent>()
            .add_plugins(GroundDetectionPlugin);
        let owner = app
            .world_mut()
            .spawn((Collider::cuboid(6., 14.), GroundDetection::default()))
            .id();
        let floor = app.world_mut().spawn(Collider::cuboid(20., 2.)).id();
        app.update();
        let old = app
            .world_mut()
            .query_filtered::<Entity, With<GroundSensor>>()
            .single(app.world())
            .unwrap();
        app.world_mut().write_message(CollisionEvent::Started(
            old,
            floor,
            CollisionEventFlags::empty(),
        ));
        app.update();
        assert!(app.world().get::<GroundDetection>(owner).unwrap().on_ground);
        app.world_mut()
            .entity_mut(owner)
            .remove::<Collider>()
            .insert(Collider::cuboid(6., 14.));
        app.world_mut().write_message(CollisionEvent::Started(
            old,
            floor,
            CollisionEventFlags::empty(),
        ));
        app.update();
        assert!(app.world().get_entity(old).is_err());
        assert!(!app.world().get::<GroundDetection>(owner).unwrap().on_ground);
        let sensor = app
            .world_mut()
            .query::<&GroundSensor>()
            .single(app.world())
            .unwrap();
        assert!(sensor.intersecting_ground_entities.is_empty());
    }
}
