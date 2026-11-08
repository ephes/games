use crate::{
    climbing::Climber,
    ground_detection::{GroundDetection, GroundSensor},
    player::Player,
};
use bevy::input::ButtonInput;
use bevy::prelude::*;
use bevy_ecs_ldtk::prelude::*;
use bevy_rapier2d::prelude::*;

pub fn setup(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut rapier_config: Query<&mut RapierConfiguration>,
) {
    commands.spawn(Camera2d);

    if let Ok(mut config) = rapier_config.single_mut() {
        config.gravity = Vec2::new(0.0, -2000.0);
    }

    let ldtk_handle = asset_server.load("Typical_2D_platformer_example.ldtk");
    commands.spawn(LdtkWorldBundle {
        ldtk_handle: ldtk_handle.into(),
        ..Default::default()
    });
}

pub fn update_level_selection(
    level_query: Query<(&LevelIid, &Transform), Without<Player>>,
    player_query: Query<&Transform, With<Player>>,
    mut level_selection: ResMut<LevelSelection>,
    ldtk_projects: Query<&LdtkProjectHandle>,
    ldtk_project_assets: Res<Assets<LdtkProject>>,
) {
    let Ok(handle) = ldtk_projects.single() else {
        return;
    };
    let Some(project) = ldtk_project_assets.get(handle) else {
        return;
    };
    if project
        .find_raw_level_by_level_selection(&level_selection)
        .is_none()
    {
        if let Some(level) = project.iter_raw_levels().next() {
            *level_selection = LevelSelection::iid(level.iid.clone());
        }
        return;
    }
    for (level_iid, level_transform) in &level_query {
        let Some(level) = project.get_raw_level_by_iid(level_iid.get()) else {
            continue;
        };
        let level_bounds = Rect {
            min: Vec2::new(level_transform.translation.x, level_transform.translation.y),
            max: Vec2::new(
                level_transform.translation.x + level.px_wid as f32,
                level_transform.translation.y + level.px_hei as f32,
            ),
        };

        for player_transform in &player_query {
            if player_transform.translation.x < level_bounds.max.x
                && player_transform.translation.x > level_bounds.min.x
                && player_transform.translation.y < level_bounds.max.y
                && player_transform.translation.y > level_bounds.min.y
                && project
                    .find_raw_level_by_level_selection(&level_selection)
                    .is_some_and(|selected| selected.iid != level.iid)
            {
                *level_selection = LevelSelection::iid(level.iid.clone());
            }
        }
    }
}

fn player_spawn(level: &ldtk::Level) -> Option<(&LayerInstance, &EntityInstance)> {
    let mut spawns = level.layer_instances.as_ref()?.iter().flat_map(|layer| {
        layer
            .entity_instances
            .iter()
            .filter(|entity| entity.identifier == "Player")
            .map(move |entity| (layer, entity))
    });
    let spawn = spawns.next()?;
    spawns.next().is_none().then_some(spawn)
}

#[allow(clippy::type_complexity, clippy::too_many_arguments)]
pub fn restart_level(
    mut commands: Commands,
    level_query: Query<(Entity, &LevelIid, &Transform), Without<Player>>,
    input: Res<ButtonInput<KeyCode>>,
    mut selection: ResMut<LevelSelection>,
    projects: Query<&LdtkProjectHandle>,
    assets: Res<Assets<LdtkProject>>,
    settings: Res<LdtkSettings>,
    mut players: Query<
        (
            Entity,
            &mut Transform,
            &mut Velocity,
            &mut Climber,
            &mut GroundDetection,
            &mut GravityScale,
        ),
        With<Player>,
    >,
    mut sensors: Query<&mut GroundSensor>,
) {
    if !input.just_pressed(KeyCode::KeyR) {
        return;
    }
    let Ok(handle) = projects.single() else {
        return;
    };
    let Some(project) = assets.get(handle) else {
        return;
    };
    // Worldly deduplicates by authored entity identity, so this single-player
    // game supports exactly one authored Player in the project.
    let spawn_count = project
        .iter_raw_levels()
        .flat_map(|level| level.layer_instances.iter().flatten())
        .flat_map(|layer| &layer.entity_instances)
        .filter(|entity| entity.identifier == "Player")
        .count();
    if spawn_count != 1 {
        warn!("Restart requires exactly one authored Player spawn");
        return;
    }
    let selected = project.find_raw_level_by_level_selection(&selection);
    // Neighboring levels need not contain a Player spawn: return to the first
    // authored spawn level, in project order, in that case.
    let Some(level) = selected
        .filter(|level| player_spawn(level).is_some())
        .or_else(|| {
            project
                .iter_raw_levels()
                .find(|level| player_spawn(level).is_some())
        })
    else {
        return;
    };
    let Some((layer, spawn)) = player_spawn(level) else {
        return;
    };
    let definitions =
        bevy_ecs_ldtk::utils::create_entity_definition_map(&project.json_data().defs.entities);
    if !definitions.contains_key(&spawn.def_uid) {
        return;
    }
    let spawn_transform = bevy_ecs_ldtk::utils::calculate_transform_from_entity_instance(
        spawn,
        &definitions,
        level.px_hei,
    );
    let offset = level_query
        .iter()
        .find(|(_, iid, _)| iid.get() == &level.iid)
        .map(|(_, _, transform)| transform.translation.truncate())
        .unwrap_or_else(|| match settings.level_spawn_behavior {
            LevelSpawnBehavior::UseWorldTranslation { .. } => {
                Vec2::new(level.world_x as f32, -(level.world_y + level.px_hei) as f32)
            }
            _ => Vec2::ZERO,
        });
    let position = spawn_transform.translation.truncate()
        + offset
        + Vec2::new(
            layer.px_total_offset_x as f32,
            -layer.px_total_offset_y as f32,
        );
    let Ok((player, mut transform, mut velocity, mut climber, mut ground, mut gravity)) =
        players.single_mut()
    else {
        return;
    };
    transform.translation.x = position.x;
    transform.translation.y = position.y;
    transform.scale = spawn_transform.scale;
    *velocity = Velocity::zero();
    *climber = Climber::default();
    ground.on_ground = false;
    gravity.0 = 1.;
    for mut sensor in &mut sensors {
        if sensor.ground_detection_entity == player {
            sensor.intersecting_ground_entities.clear();
        }
    }
    *selection = LevelSelection::iid(level.iid.clone());
    for (entity, _, _) in &level_query {
        commands.entity(entity).insert(Respawn);
    }
}

pub struct GameFlowPlugin;

impl Plugin for GameFlowPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, setup)
            .add_systems(Update, update_level_selection)
            .add_systems(
                Update,
                restart_level
                    .after(update_level_selection)
                    .after(crate::player::player_movement)
                    .after(crate::climbing::ignore_gravity_if_climbing)
                    .after(crate::ground_detection::update_on_ground),
            );
    }
}
