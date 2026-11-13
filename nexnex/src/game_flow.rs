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
    level_query: Query<(&LevelIid, &GlobalTransform), Without<Player>>,
    player_query: Query<&GlobalTransform, With<Player>>,
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
    let Some(selected) = project.find_raw_level_by_level_selection(&level_selection) else {
        if let Some(level) = project.iter_raw_levels().next() {
            *level_selection = LevelSelection::iid(level.iid.clone());
        }
        return;
    };
    let Ok(player) = player_query.single() else {
        return;
    };
    let contains = |level: &ldtk::Level| {
        level_query
            .iter()
            .find(|(iid, _)| iid.get() == &level.iid)
            .is_some_and(|(_, transform)| {
                let local = transform
                    .affine()
                    .inverse()
                    .transform_point3(player.translation())
                    .truncate();
                // Half-open bounds give an exact seam to the level beginning there.
                local.is_finite()
                    && local.cmpge(Vec2::ZERO).all()
                    && local
                        .cmplt(Vec2::new(level.px_wid as f32, level.px_hei as f32))
                        .all()
            })
    };
    if contains(selected) {
        return;
    }
    if let Some(level) = project.iter_raw_levels().find(|level| contains(level)) {
        *level_selection = LevelSelection::iid(level.iid.clone());
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
    level_query: Query<(Entity, &LevelIid, &GlobalTransform), Without<Player>>,
    input: Res<ButtonInput<KeyCode>>,
    mut selection: ResMut<LevelSelection>,
    projects: Query<(&LdtkProjectHandle, Option<&GlobalTransform>)>,
    globals: Query<&GlobalTransform>,
    assets: Res<Assets<LdtkProject>>,
    settings: Res<LdtkSettings>,
    mut players: Query<
        (
            Entity,
            Option<&ChildOf>,
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
    let Ok((handle, world_transform)) = projects.single() else {
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
    let level_transform = level_query
        .iter()
        .find(|(_, iid, _)| iid.get() == &level.iid)
        .map(|(_, _, transform)| *transform)
        .unwrap_or_else(|| {
            let offset = match settings.level_spawn_behavior {
                LevelSpawnBehavior::UseWorldTranslation { .. } => Vec3::new(
                    level.world_x as f32,
                    -(level.world_y + level.px_hei) as f32,
                    0.,
                ),
                _ => Vec3::ZERO,
            };
            world_transform
                .copied()
                .unwrap_or_default()
                .mul_transform(Transform::from_translation(offset))
        });
    let position = level_transform.transform_point(
        spawn_transform.translation
            + Vec3::new(
                layer.px_total_offset_x as f32,
                -layer.px_total_offset_y as f32,
                0.,
            ),
    );
    let Ok((player, parent, mut transform, mut velocity, mut climber, mut ground, mut gravity)) =
        players.single_mut()
    else {
        return;
    };
    let position = if let Some(parent) = parent {
        let Ok(parent_transform) = globals.get(parent.parent()) else {
            return;
        };
        parent_transform
            .affine()
            .inverse()
            .transform_point3(position)
    } else {
        position
    };
    if !position.is_finite() {
        return;
    }
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
            .add_systems(
                PostUpdate,
                update_level_selection.after(bevy::transform::TransformSystems::Propagate),
            )
            .add_systems(
                Update,
                // After every contact observation and control step, so no
                // contact read later in this frame survives the reset.
                restart_level.after(crate::ControlSet::Gravity),
            );
    }
}
