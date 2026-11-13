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
            PostUpdate,
            (
                game_flow::update_level_selection,
                camera::camera_fit_inside_current_level,
            )
                .chain()
                .after(bevy::transform::TransformSystems::Propagate),
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

#[test]
fn overlapping_selection_is_sticky_then_uses_project_order_and_half_open_seams() {
    for reverse in [false, true] {
        for (selected, x, expected) in [
            (2, 80., "b"),
            (3, 80., "a"),
            (3, 0., "a"),
            (1, 128., "b"),
            (2, 192., "c"),
        ] {
            let levels = ["a", "b", "c"]
                .into_iter()
                .enumerate()
                .map(|(i, iid)| bevy_ecs_ldtk::ldtk::Level {
                    iid: iid.into(),
                    uid: i as i32 + 1,
                    ..testing::level()
                })
                .collect();
            let (mut app, handle) = testing::project_app(levels);
            app.insert_resource(LevelSelection::Uid(selected))
                .add_systems(
                    PostUpdate,
                    game_flow::update_level_selection
                        .after(bevy::transform::TransformSystems::Propagate),
                );
            app.world_mut().spawn(LdtkProjectHandle::from(handle));
            let mut positions = vec![("a", 0.), ("b", 64.), ("c", 192.)];
            if reverse {
                positions.reverse();
            }
            for (iid, x) in positions {
                app.world_mut()
                    .spawn((LevelIid::new(iid), Transform::from_xyz(x, 0., 0.)));
            }
            app.world_mut()
                .spawn((Player, Transform::from_xyz(x, 64., 0.)));
            for _ in 0..4 {
                app.update();
                let mut query = app.world_mut().query::<&LdtkProjectHandle>();
                let handle = query.single(app.world()).unwrap();
                let project = app
                    .world()
                    .resource::<Assets<LdtkProject>>()
                    .get(handle)
                    .unwrap();
                assert_eq!(
                    project
                        .find_raw_level_by_level_selection(app.world().resource::<LevelSelection>())
                        .unwrap()
                        .iid,
                    expected,
                    "reverse={reverse}, selected={selected}, x={x}"
                );
            }
        }
    }
}

#[test]
fn authored_world_hierarchy_selection_camera_and_restart_share_coordinates() {
    let mut data = synthetic_project();
    for level in &mut data.levels {
        level.px_wid = 512;
    }
    let layer = &mut data.levels[0].layer_instances.as_mut().unwrap()[0];
    layer.px_total_offset_x = 12;
    layer.px_total_offset_y = 8;
    let (mut app, handle) = testing::project_data_app(data);
    lifecycle(&mut app);
    app.init_resource::<ButtonInput<KeyCode>>()
        .insert_resource(LevelSelection::Uid(1))
        .add_systems(Update, game_flow::restart_level)
        .add_systems(
            PostUpdate,
            (
                game_flow::update_level_selection,
                camera::camera_fit_inside_current_level,
            )
                .chain()
                .after(bevy::transform::TransformSystems::Propagate),
        )
        .register_ldtk_entity::<player::PlayerBundle>("Player");
    let world = app
        .world_mut()
        .spawn(LdtkWorldBundle {
            ldtk_handle: handle.into(),
            transform: Transform::from_xyz(1000., -300., 0.).with_scale(Vec3::new(2., 3., 1.)),
            ..default()
        })
        .id();
    for (iid, x) in [("synthetic-level", 100.), ("neighbor-without-spawn", 612.)] {
        app.world_mut().spawn((
            LevelIid::new(iid),
            Transform::from_xyz(x, 200., 0.),
            Respawn,
            ChildOf(world),
        ));
    }
    // A separate translated parent also exercises conversion of the camera's
    // world-space target back into its own local transform.
    let camera_parent = app
        .world_mut()
        .spawn(Transform::from_xyz(-50., 75., 0.))
        .id();
    let camera = app
        .world_mut()
        .spawn((
            Projection::Orthographic(OrthographicProjection::default_2d()),
            Transform::from_xyz(0., 0., 99.),
            ChildOf(camera_parent),
        ))
        .id();
    for _ in 0..4 {
        app.update();
    }
    let player = app
        .world_mut()
        .query_filtered::<Entity, With<Player>>()
        .single(app.world())
        .unwrap();
    let spawn = app
        .world()
        .get::<GlobalTransform>(player)
        .unwrap()
        .translation();
    assert!((spawn.truncate() - Vec2::new(1272., 564.)).length() < 0.001);
    assert_camera_bounds(&app, camera, Vec2::new(1200., 300.), Vec2::new(1024., 384.));
    // Worldly player is parented directly to the world. Its local coordinate
    // differs from both the level's and the independent camera parent's.
    app.world_mut()
        .get_mut::<Transform>(player)
        .unwrap()
        .translation
        .x = 1000.;
    app.update();
    assert_eq!(
        *app.world().resource::<LevelSelection>(),
        LevelSelection::iid("neighbor-without-spawn")
    );
    assert_camera_bounds(&app, camera, Vec2::new(2224., 300.), Vec2::new(1024., 384.));
    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .press(KeyCode::KeyR);
    app.update();
    app.world_mut()
        .resource_mut::<ButtonInput<KeyCode>>()
        .clear();
    for _ in 0..4 {
        app.update();
    }
    assert_eq!(
        app.world_mut()
            .query_filtered::<Entity, With<Player>>()
            .single(app.world())
            .unwrap(),
        player
    );
    assert!(
        (app.world()
            .get::<GlobalTransform>(player)
            .unwrap()
            .translation()
            - spawn)
            .length()
            < 0.001
    );
    assert_eq!(
        *app.world().resource::<LevelSelection>(),
        LevelSelection::iid("synthetic-level")
    );
    assert_camera_bounds(&app, camera, Vec2::new(1200., 300.), Vec2::new(1024., 384.));
}

fn assert_camera_bounds(app: &App, camera: Entity, min: Vec2, extent: Vec2) {
    let position = app
        .world()
        .get::<GlobalTransform>(camera)
        .unwrap()
        .translation()
        .truncate();
    let Projection::Orthographic(projection) = app.world().get::<Projection>(camera).unwrap()
    else {
        panic!("orthographic camera required")
    };
    let bevy::camera::ScalingMode::Fixed { width, height } = projection.scaling_mode else {
        panic!("fixed viewport required")
    };
    let size = Vec2::new(width, height);
    assert!(
        position.cmpge(min - Vec2::splat(0.001)).all(),
        "camera {position:?}, min {min:?}"
    );
    assert!(
        position
            .cmple(min + (extent - size).max(Vec2::ZERO) + Vec2::splat(0.001))
            .all(),
        "camera {position:?}, size {size:?}, extent {extent:?}"
    );
    assert!((size.x / size.y - 16. / 9.).abs() < 0.001);
    assert_eq!(height, 387.);
}

fn inventory_cases() -> Vec<(Vec<FieldInstance>, inventory::Inventory)> {
    let field = |value, field_type: &str| FieldInstance {
        identifier: "items".into(),
        field_instance_type: field_type.into(),
        value,
        tile: None,
        def_uid: 3,
        real_editor_values: vec![],
    };
    let valid = vec![field(
        FieldValue::Enums(vec![Some("Key".into())]),
        "Array<LocalEnum.Item>",
    )];
    let expected = inventory::Inventory::from(&EntityInstance {
        field_instances: valid.clone(),
        ..default()
    });
    vec![
        (vec![], inventory::Inventory::default()),
        (
            vec![field(
                FieldValue::Enums(vec![None]),
                "Array<LocalEnum.Item>",
            )],
            inventory::Inventory::default(),
        ),
        (
            vec![field(FieldValue::String(None), "String")],
            inventory::Inventory::default(),
        ),
        (
            vec![field(FieldValue::Int(Some(1)), "Int")],
            inventory::Inventory::default(),
        ),
        (valid, expected),
    ]
}

#[test]
fn malformed_authored_inventory_initial_load_and_reload_stay_playable() {
    for (fields, expected) in inventory_cases() {
        let mut data = synthetic_project();
        data.levels[0].layer_instances.as_mut().unwrap()[0].entity_instances[0].field_instances =
            fields.clone();
        let (mut app, handle) = testing::project_data_app(data);
        lifecycle(&mut app);
        app.register_ldtk_entity::<player::PlayerBundle>("Player");
        let world = app
            .world_mut()
            .spawn(LdtkWorldBundle {
                ldtk_handle: handle.into(),
                ..default()
            })
            .id();
        let level = app
            .world_mut()
            .spawn((
                LevelIid::new("synthetic-level"),
                Transform::default(),
                Respawn,
                ChildOf(world),
            ))
            .id();
        for _ in 0..3 {
            app.update();
        }
        let player = app
            .world_mut()
            .query_filtered::<Entity, With<Player>>()
            .single(app.world())
            .unwrap();
        assert_eq!(
            app.world().get::<inventory::Inventory>(player),
            Some(&expected)
        );
        assert!(app.world().get::<Collider>(player).is_some());
        // A real level reload keeps the existing Worldly player (and inventory).
        app.world_mut().entity_mut(level).insert(Respawn);
        for _ in 0..3 {
            app.update();
        }
        assert_eq!(
            app.world_mut()
                .query_filtered::<Entity, With<Player>>()
                .single(app.world())
                .unwrap(),
            player
        );
        assert_eq!(
            app.world().get::<inventory::Inventory>(player),
            Some(&expected)
        );
        // Conversion is also safe if a reload needs to construct a new player.
        app.world_mut().despawn(player);
        app.world_mut().entity_mut(level).insert(Respawn);
        for _ in 0..3 {
            app.update();
        }
        let player = app
            .world_mut()
            .query_filtered::<Entity, With<Player>>()
            .single(app.world())
            .unwrap();
        assert_eq!(
            app.world().get::<inventory::Inventory>(player),
            Some(&expected)
        );
    }
}

#[test]
fn edited_inventory_asset_retains_the_previous_worldly_player() {
    let (valid, expected) = inventory_cases().pop().unwrap();
    let mut data = synthetic_project();
    data.levels[0].layer_instances.as_mut().unwrap()[0].entity_instances[0].field_instances = valid;
    let (mut app, handle) = testing::project_data_app(data);
    lifecycle(&mut app);
    app.register_ldtk_entity::<player::PlayerBundle>("Player");
    let world = app
        .world_mut()
        .spawn(LdtkWorldBundle {
            ldtk_handle: handle.clone().into(),
            ..default()
        })
        .id();
    let level = app
        .world_mut()
        .spawn((
            LevelIid::new("synthetic-level"),
            Transform::default(),
            Respawn,
            ChildOf(world),
        ))
        .id();
    for _ in 0..3 {
        app.update();
    }
    let player = app
        .world_mut()
        .query_filtered::<Entity, With<Player>>()
        .single(app.world())
        .unwrap();
    let position = *app.world().get::<Transform>(player).unwrap();
    for (fields, _) in inventory_cases() {
        let mut replacement = synthetic_project();
        replacement.levels[0].layer_instances.as_mut().unwrap()[0].entity_instances[0]
            .field_instances = fields;
        let (loaded, replacement_handle) = testing::project_data_app(replacement);
        let replacement = loaded
            .world()
            .resource::<Assets<LdtkProject>>()
            .get(&replacement_handle)
            .unwrap()
            .clone();
        app.world_mut()
            .resource_mut::<Assets<LdtkProject>>()
            .insert(handle.id(), replacement)
            .unwrap();
        app.world_mut().entity_mut(level).insert(Respawn);
        for _ in 0..3 {
            app.update();
        }
        assert_eq!(
            app.world_mut()
                .query_filtered::<Entity, With<Player>>()
                .single(app.world())
                .unwrap(),
            player
        );
        assert_eq!(
            app.world().get::<inventory::Inventory>(player),
            Some(&expected)
        );
        assert_eq!(*app.world().get::<Transform>(player).unwrap(), position);
    }
}

fn physics_project() -> LdtkJson {
    let mut data = synthetic_project();
    let layer = &mut data.levels[0].layer_instances.as_mut().unwrap()[0];
    layer.entity_instances[0].px = IVec2::new(56, 32);
    for (uid, name, width, height, px) in [
        (4, "Chest", 16, 16, IVec2::new(56, 72)),
        (5, "Mob", 10, 10, IVec2::new(110, 20)),
    ] {
        layer.entity_instances.push(EntityInstance {
            iid: name.into(),
            identifier: name.into(),
            def_uid: uid,
            width,
            height,
            px,
            pivot: Vec2::splat(0.5),
            field_instances: if name == "Mob" {
                vec![FieldInstance {
                    identifier: "patrol".into(),
                    field_instance_type: "Array<Point>".into(),
                    value: FieldValue::Points(vec![Some(IVec2::new(6, 1))]),
                    tile: None,
                    def_uid: 7,
                    real_editor_values: vec![],
                }]
            } else {
                vec![]
            },
            ..default()
        });
        data.defs.entities.push(EntityDefinition {
            uid,
            width,
            height,
            ..default()
        });
    }
    let mut cells = vec![0; 64];
    cells[3 * 8 + 3] = 2;
    data.levels[0]
        .layer_instances
        .as_mut()
        .unwrap()
        .push(LayerInstance {
            iid: "ladders".into(),
            identifier: "Ladders".into(),
            layer_def_uid: 6,
            layer_instance_type: Type::IntGrid,
            c_wid: 8,
            c_hei: 8,
            grid_size: 16,
            int_grid_csv: cells,
            ..default()
        });
    data.defs.layers.push(LayerDefinition {
        uid: 6,
        layer_definition_type: "IntGrid".into(),
        purple_type: Type::IntGrid,
        grid_size: 16,
        int_grid_values: vec![bevy_ecs_ldtk::ldtk::IntGridValueDefinition {
            value: 2,
            ..default()
        }],
        ..default()
    });
    data
}

#[test]
fn authored_bundles_create_rapier_bodies_and_one_ground_sensor() {
    use bevy::time::TimeUpdateStrategy;
    for chest_supports in [true, false] {
        let mut data = physics_project();
        if !chest_supports {
            let entities =
                &mut data.levels[0].layer_instances.as_mut().unwrap()[0].entity_instances;
            entities[0].px.y = 36; // foot sensor overlaps the authored ladder
            entities[1].px.x = 110; // chest is elsewhere
        }
        let (mut app, handle) = testing::project_data_app(data);
        lifecycle(&mut app);
        app.add_plugins((
            RapierPhysicsPlugin::<NoUserData>::pixels_per_meter(100.),
            ground_detection::GroundDetectionPlugin,
        ))
        .insert_resource(TimeUpdateStrategy::ManualDuration(
            std::time::Duration::from_secs_f32(1. / 60.),
        ))
        .insert_resource(TimestepMode::Fixed {
            dt: 1. / 60.,
            substeps: 1,
        })
        .add_systems(
            Update,
            climbing::detect_climb_range.in_set(ControlSet::Observe),
        )
        .register_ldtk_entity::<player::PlayerBundle>("Player")
        .register_ldtk_entity::<misc_objects::ChestBundle>("Chest")
        .register_ldtk_entity::<enemy::MobBundle>("Mob")
        .register_ldtk_int_cell::<climbing::LadderBundle>(2);
        // The in-memory asset loader already ran startup before Rapier was added.
        app.world_mut().run_schedule(PreStartup);
        if !chest_supports {
            let mut query = app.world_mut().query::<&mut RapierConfiguration>();
            query.single_mut(app.world_mut()).unwrap().gravity = Vec2::ZERO;
        }
        let world = app
            .world_mut()
            .spawn(LdtkWorldBundle {
                ldtk_handle: handle.into(),
                ..default()
            })
            .id();
        app.world_mut().spawn((
            LevelIid::new("synthetic-level"),
            Transform::default(),
            Respawn,
            ChildOf(world),
        ));
        // A fixed synthetic floor supports the dynamic authored chest.
        app.world_mut().spawn((
            Collider::cuboid(64., 4.),
            RigidBody::Fixed,
            Transform::from_xyz(64., 28., 0.),
        ));
        for _ in 0..4 {
            app.update();
        }
        let player = app
            .world_mut()
            .query_filtered::<Entity, With<Player>>()
            .single(app.world())
            .unwrap();
        let chest = app
            .world_mut()
            .query::<(Entity, &EntityIid)>()
            .iter(app.world())
            .find(|(_, iid)| iid.as_str() == "Chest")
            .unwrap()
            .0;
        let mob = app
            .world_mut()
            .query_filtered::<Entity, With<enemy::Enemy>>()
            .single(app.world())
            .unwrap();
        for (entity, half_extents, body) in [
            (player, Vec2::new(6., 14.), RigidBody::Dynamic),
            (chest, Vec2::splat(8.), RigidBody::Dynamic),
            (mob, Vec2::splat(5.), RigidBody::KinematicVelocityBased),
        ] {
            assert_eq!(
                app.world()
                    .get::<Collider>(entity)
                    .unwrap()
                    .as_cuboid()
                    .unwrap()
                    .half_extents(),
                half_extents
            );
            assert_eq!(*app.world().get::<RigidBody>(entity).unwrap(), body);
            assert_eq!(
                *app.world().get::<LockedAxes>(entity).unwrap(),
                LockedAxes::ROTATION_LOCKED
            );
            assert!(app.world().get::<RapierColliderHandle>(entity).is_some());
            assert!(app.world().get::<RapierRigidBodyHandle>(entity).is_some());
        }
        assert_eq!(app.world().get::<Friction>(player).unwrap().coefficient, 0.);
        assert_eq!(
            app.world().get::<Friction>(player).unwrap().combine_rule,
            CoefficientCombineRule::Min
        );
        assert_eq!(app.world().get::<Friction>(chest).unwrap().coefficient, 0.5);
        assert_eq!(
            *app.world().get::<ColliderMassProperties>(chest).unwrap(),
            ColliderMassProperties::Density(15.)
        );
        let sensors: Vec<_> = app
            .world_mut()
            .query::<(Entity, &GroundSensor)>()
            .iter(app.world())
            .map(|(entity, sensor)| {
                assert_eq!(sensor.ground_detection_entity, player);
                entity
            })
            .collect();
        assert_eq!(sensors.len(), 1);
        let sensor = sensors[0];
        assert_eq!(app.world().get::<ChildOf>(sensor).unwrap().parent(), player);
        assert_eq!(
            app.world().get::<Transform>(sensor).unwrap().translation,
            Vec3::new(0., -14., 0.)
        );
        assert_eq!(
            app.world()
                .get::<Collider>(sensor)
                .unwrap()
                .as_cuboid()
                .unwrap()
                .half_extents(),
            Vec2::new(3., 2.)
        );
        assert!(app.world().get::<Sensor>(sensor).is_some());
        assert_eq!(
            *app.world().get::<ActiveEvents>(sensor).unwrap(),
            ActiveEvents::COLLISION_EVENTS
        );
        let ladder = app
            .world_mut()
            .query_filtered::<Entity, With<climbing::Climbable>>()
            .single(app.world())
            .unwrap();
        assert_eq!(
            app.world()
                .get::<Collider>(ladder)
                .unwrap()
                .as_cuboid()
                .unwrap()
                .half_extents(),
            Vec2::splat(8.)
        );
        assert!(app.world().get::<Sensor>(ladder).is_some());
        assert!(app.world().get::<RapierColliderHandle>(ladder).is_some());
        // Let real Rapier generate contact messages: no synthetic collision events.
        for _ in 0..120 {
            app.update();
        }
        let contacts = &app
            .world()
            .get::<GroundSensor>(sensor)
            .unwrap()
            .intersecting_ground_entities;
        assert_eq!(
            app.world()
                .get::<GroundDetection>(player)
                .unwrap()
                .on_ground,
            chest_supports
        );
        assert_eq!(contacts.contains(&chest), chest_supports);
        assert!(!contacts.contains(&ladder));
        if !chest_supports {
            assert!(contacts.is_empty());
            assert!(app
                .world()
                .get::<Climber>(player)
                .unwrap()
                .intersecting_climbables
                .contains(&ladder));
            let mut query = app.world_mut().query::<RapierContext>();
            let context = query.single(app.world()).unwrap();
            assert_eq!(
                context
                    .simulation
                    .intersection_pair(context.colliders, sensor, ladder),
                Some(true)
            );
        }
        assert_eq!(
            app.world_mut()
                .query::<&GroundSensor>()
                .iter(app.world())
                .count(),
            1
        );
    }
}
