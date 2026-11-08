use super::*;
use bevy::app::MainScheduleOrder;
use bevy_ecs_ldtk::{
    app::{LdtkEntityMap, LdtkIntCellMap},
    ldtk::{Definitions, EntityDefinition, FieldInstance, LayerDefinition, LdtkJson, Type},
};
use climbing::Climber;
use ground_detection::{GroundDetection, GroundSensor};
use player::Player;
use std::collections::HashSet;

fn synthetic_project() -> LdtkJson {
    let mut level = testing::level();
    level.layer_instances = Some(vec![LayerInstance {
        iid: "entities".into(),
        identifier: "Entities".into(),
        layer_def_uid: 2,
        layer_instance_type: Type::Entities,
        c_wid: 8,
        c_hei: 8,
        grid_size: 16,
        entity_instances: vec![EntityInstance {
            iid: "player".into(),
            identifier: "Player".into(),
            def_uid: 1,
            px: IVec2::new(24, 32),
            pivot: Vec2::splat(0.5),
            width: 12,
            height: 28,
            field_instances: vec![FieldInstance {
                identifier: "items".into(),
                field_instance_type: "Array<LocalEnum.Item>".into(),
                tile: None,
                value: FieldValue::Enums(vec![]),
                def_uid: 3,
                real_editor_values: vec![],
            }],
            ..default()
        }],
        ..default()
    }]);
    LdtkJson {
        defs: Definitions {
            entities: vec![EntityDefinition {
                uid: 1,
                width: 12,
                height: 28,
                ..default()
            }],
            layers: vec![LayerDefinition {
                uid: 2,
                ..default()
            }],
            ..default()
        },
        levels: vec![
            level,
            bevy_ecs_ldtk::ldtk::Level {
                iid: "neighbor-without-spawn".into(),
                uid: 2,
                ..testing::level()
            },
        ],
        ..default()
    }
}

// Use the installed LDtk 0.14 public lifecycle systems without its renderer plugin.
fn lifecycle(app: &mut App) {
    use bevy_ecs_ldtk::systems;
    app.world_mut()
        .resource_mut::<MainScheduleOrder>()
        .insert_after(Update, ProcessLdtkApi);
    app.init_non_send_resource::<LdtkEntityMap>()
        .init_non_send_resource::<LdtkIntCellMap>()
        .init_resource::<LdtkSettings>()
        .init_resource::<ClearColor>()
        .add_message::<LevelEvent>()
        .add_systems(PreUpdate, systems::process_ldtk_levels)
        .add_systems(
            ProcessLdtkApi,
            (ApplyDeferred, systems::clean_respawn_entities).chain(),
        )
        .add_systems(
            PostUpdate,
            systems::worldly_adoption.after(bevy::transform::TransformSystems::Propagate),
        );
}

#[test]
fn restart_keeps_one_worldly_player_at_spawn_without_stale_physics() {
    assert_restart(LevelSelection::Uid(1));
    assert_restart(LevelSelection::Uid(2));
}

fn assert_restart(selection: LevelSelection) {
    let (mut app, project) = testing::project_data_app(synthetic_project());
    lifecycle(&mut app);
    app.init_resource::<ButtonInput<KeyCode>>()
        .insert_resource(selection)
        .add_systems(Update, game_flow::restart_level)
        .add_systems(Update, ground_detection::spawn_ground_sensor)
        .register_ldtk_entity::<player::PlayerBundle>("Player");
    let world = app
        .world_mut()
        .spawn(LdtkWorldBundle {
            ldtk_handle: project.into(),
            ..default()
        })
        .id();
    let level = app
        .world_mut()
        .spawn((
            LevelIid::new("synthetic-level"),
            Transform::from_xyz(100., 200., 0.),
            Respawn,
            ChildOf(world),
        ))
        .id();
    for _ in 0..3 {
        app.update();
    }
    let mut players = app.world_mut().query_filtered::<Entity, With<Player>>();
    let player = players.single(app.world()).unwrap();
    assert_eq!(app.world().get::<ChildOf>(player).unwrap().parent(), world);
    let spawn = app.world().get::<Transform>(player).unwrap().translation;
    assert_eq!(spawn.truncate(), Vec2::new(124., 296.));
    app.world_mut()
        .get_mut::<Transform>(player)
        .unwrap()
        .translation = Vec3::new(-500., -500., spawn.z);
    app.world_mut().get_mut::<Velocity>(player).unwrap().linvel = Vec2::new(40., -200.);
    app.world_mut().get_mut::<Velocity>(player).unwrap().angvel = 3.;
    let stale = app.world_mut().spawn_empty().id();
    *app.world_mut().get_mut::<Climber>(player).unwrap() = Climber {
        climbing: true,
        intersecting_climbables: HashSet::from([stale]),
    };
    app.world_mut()
        .get_mut::<GroundDetection>(player)
        .unwrap()
        .on_ground = true;
    app.world_mut().get_mut::<GravityScale>(player).unwrap().0 = 0.;
    let mut sensors = app.world_mut().query::<&mut GroundSensor>();
    for mut sensor in sensors.iter_mut(app.world_mut()) {
        sensor.intersecting_ground_entities.insert(stale);
    }
    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .press(KeyCode::KeyR);
    app.update();
    assert!(app.world().get::<Respawn>(level).is_some());
    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .clear();
    for _ in 0..3 {
        app.update();
    }
    assert_eq!(players.single(app.world()).unwrap(), player);
    assert_eq!(
        app.world().get::<Transform>(player).unwrap().translation,
        spawn
    );
    assert_eq!(
        *app.world().get::<Velocity>(player).unwrap(),
        Velocity::zero()
    );
    assert_eq!(
        *app.world().get::<Climber>(player).unwrap(),
        Climber::default()
    );
    assert!(
        !app.world()
            .get::<GroundDetection>(player)
            .unwrap()
            .on_ground
    );
    assert_eq!(app.world().get::<GravityScale>(player).unwrap().0, 1.);
    assert!(sensors
        .iter(app.world())
        .all(|sensor| sensor.intersecting_ground_entities.is_empty()));
    assert!(app.world().get::<Respawn>(level).is_none());
    assert_eq!(
        *app.world().resource::<LevelSelection>(),
        LevelSelection::iid("synthetic-level")
    );
}

#[test]
fn project_unavailability_preserves_camera_and_recovers_selection() {
    let (mut app, handle) = testing::project_app(vec![testing::level()]);
    app.add_plugins(walls::WallPlugin);
    app.insert_resource(LevelSelection::iid("synthetic-level"))
        .add_systems(
            Update,
            (
                game_flow::update_level_selection,
                camera::camera_fit_inside_current_level,
            )
                .chain(),
        );
    let world = app
        .world_mut()
        .spawn(LdtkProjectHandle::from(handle.clone()))
        .id();
    let level = app
        .world_mut()
        .spawn((LevelIid::new("synthetic-level"), Transform::default()))
        .id();
    app.world_mut()
        .spawn((Player, Transform::from_xyz(64., 64., 0.)));
    let layer = app
        .world_mut()
        .spawn((
            LayerMetadata::from(&LayerInstance {
                c_wid: 8,
                c_hei: 8,
                grid_size: 16,
                ..default()
            }),
            ChildOf(level),
        ))
        .id();
    app.world_mut()
        .spawn((walls::Wall, GridCoords::new(0, 0), ChildOf(layer)));
    let colliders = |app: &mut App| {
        app.world_mut()
            .query::<&Collider>()
            .iter(app.world())
            .count()
    };
    let camera = app
        .world_mut()
        .spawn((
            Projection::Orthographic(OrthographicProjection::default_2d()),
            Transform::from_xyz(0., 0., 99.),
        ))
        .id();
    app.update();
    let previous = *app.world().get::<Transform>(camera).unwrap();
    assert_eq!(colliders(&mut app), 1);
    let project = app
        .world_mut()
        .resource_mut::<Assets<LdtkProject>>()
        .remove(handle.id())
        .unwrap();
    app.update();
    assert_eq!(*app.world().get::<Transform>(camera).unwrap(), previous);
    assert_eq!(colliders(&mut app), 1);
    app.world_mut()
        .resource_mut::<Assets<LdtkProject>>()
        .insert(handle.id(), project)
        .unwrap();
    app.update();
    assert_eq!(*app.world().get::<Transform>(camera).unwrap(), previous);
    assert_eq!(colliders(&mut app), 1);
    app.world_mut()
        .entity_mut(world)
        .remove::<LdtkProjectHandle>();
    app.update();
    let duplicate = app
        .world_mut()
        .spawn(LdtkProjectHandle::from(handle.clone()))
        .id();
    app.world_mut()
        .entity_mut(world)
        .insert(LdtkProjectHandle::from(handle));
    app.update();
    assert_eq!(*app.world().get::<Transform>(camera).unwrap(), previous);
    app.world_mut().despawn(duplicate);
    let (replacement, replacement_handle) =
        testing::project_app(vec![bevy_ecs_ldtk::ldtk::Level {
            iid: "replacement".into(),
            uid: 7,
            ..testing::level()
        }]);
    let data = replacement
        .world()
        .resource::<Assets<LdtkProject>>()
        .get(&replacement_handle)
        .unwrap()
        .clone();
    let handle = app.world().get::<LdtkProjectHandle>(world).unwrap().clone();
    app.world_mut()
        .resource_mut::<Assets<LdtkProject>>()
        .insert(handle.id(), data)
        .unwrap();
    app.update();
    assert_eq!(
        *app.world().resource::<LevelSelection>(),
        LevelSelection::iid("replacement")
    );
    app.world_mut()
        .get_mut::<LevelIid>(level)
        .unwrap()
        .clone_from(&LevelIid::new("replacement"));
    app.update();
    assert_eq!(colliders(&mut app), 1);
}
