use crate::{
    camera::PlatformerCamera,
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
    commands.spawn((Camera2d, PlatformerCamera));

    if let Ok(mut config) = rapier_config.single_mut() {
        config.gravity = Vec2::new(0.0, -2000.0);
    }

    let ldtk_handle = asset_server.load("Typical_2D_platformer_example.ldtk");
    commands.spawn(LdtkWorldBundle {
        ldtk_handle: ldtk_handle.into(),
        ..Default::default()
    });
}

#[cfg(test)]
#[derive(Resource, Default)]
pub(crate) struct SelectionWork {
    pub transform_reads: usize,
    pub containment_checks: usize,
}

pub fn update_level_selection(
    level_query: Query<(&LevelIid, &GlobalTransform), Without<Player>>,
    player_query: Query<&GlobalTransform, With<Player>>,
    mut level_selection: ResMut<LevelSelection>,
    ldtk_projects: Query<&LdtkProjectHandle>,
    ldtk_project_assets: Res<Assets<LdtkProject>>,
    #[cfg(test)] mut work: Option<ResMut<SelectionWork>>,
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
    // Snapshot each loaded transform once; candidate traversal stays in authored
    // project order, independent of ECS iteration/spawn order.
    let mut transforms = std::collections::HashMap::new();
    for (iid, transform) in &level_query {
        #[cfg(test)]
        if let Some(work) = work.as_mut() {
            work.transform_reads += 1;
        }
        // Keep the same first-match behavior if an IID is transiently duplicated.
        transforms.entry(iid.get()).or_insert(transform);
    }
    #[allow(unused_mut)] // The test-only work counter mutates its captured resource.
    let mut contains = |level: &ldtk::Level| {
        #[cfg(test)]
        if let Some(work) = work.as_mut() {
            work.containment_checks += 1;
        }
        transforms.get(&level.iid).is_some_and(|transform| {
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

#[cfg(test)]
#[derive(Resource, Default)]
pub(crate) struct RestartWork {
    pub entity_visits: usize,
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
    #[cfg(test)] mut work: Option<ResMut<RestartWork>>,
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
    let mut spawns = project
        .iter_raw_levels()
        .flat_map(|level| {
            level
                .layer_instances
                .iter()
                .flatten()
                .flat_map(move |layer| {
                    layer
                        .entity_instances
                        .iter()
                        .map(move |entity| (level, layer, entity))
                })
        })
        .filter(|(_, _, entity)| {
            #[cfg(test)]
            if let Some(work) = work.as_mut() {
                work.entity_visits += 1;
            }
            entity.identifier == "Player"
        });
    let (Some((level, layer, spawn)), None) = (spawns.next(), spawns.next()) else {
        warn!("Restart requires exactly one authored Player spawn");
        return;
    };
    let definitions =
        bevy_ecs_ldtk::utils::create_entity_definition_map(&project.json_data().defs.entities);
    let Some(definition) = definitions.get(&spawn.def_uid) else {
        return;
    };
    let definition_size = definition
        .tile_rect
        .as_ref()
        .map(|tile| (tile.w, tile.h))
        .unwrap_or((definition.width, definition.height));
    // Validate integer operations performed by LDtk's public conversion helper,
    // as well as our unloaded-level fallback, before mutating any live state.
    let bottom = level
        .world_y
        .checked_add(level.px_hei)
        .and_then(i32::checked_neg);
    if level.px_wid <= 0
        || level.px_hei <= 0
        || bottom.is_none()
        || level.px_hei.checked_sub(spawn.px.y).is_none()
        || spawn.width <= 0
        || spawn.height <= 0
        || definition_size.0 <= 0
        || definition_size.1 <= 0
        || !spawn.pivot.is_finite()
    {
        warn!("Restart refused invalid Player spawn geometry");
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
                LevelSpawnBehavior::UseWorldTranslation { .. } => {
                    Vec3::new(level.world_x as f32, bottom.unwrap() as f32, 0.)
                }
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
                -(layer.px_total_offset_y as f32),
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
    if !position.is_finite() || !spawn_transform.is_finite() {
        warn!("Restart refused invalid Player spawn transform");
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
