use bevy::camera::ScalingMode;
use bevy::prelude::*;
use bevy_ecs_ldtk::prelude::*;

use crate::player::Player;

const ASPECT_RATIO: f32 = 16. / 9.;

#[allow(clippy::type_complexity)]
pub fn camera_fit_inside_current_level(
    mut camera_query: Query<(&mut Projection, &mut Transform), Without<Player>>,
    player_query: Query<&Transform, With<Player>>,
    level_query: Query<(&Transform, &LevelIid), (Without<Projection>, Without<Player>)>,
    ldtk_projects: Query<&LdtkProjectHandle>,
    level_selection: Res<LevelSelection>,
    ldtk_project_assets: Res<Assets<LdtkProject>>,
) {
    if let Ok(Transform {
        translation: player_translation,
        ..
    }) = player_query.single()
    {
        let player_translation = *player_translation;

        let Ok((mut projection, mut camera_transform)) = camera_query.single_mut() else {
            return;
        };

        if let Projection::Orthographic(ref mut orthographic_projection) = *projection {
            for (level_transform, level_iid) in &level_query {
                let Ok(handle) = ldtk_projects.single() else {
                    return;
                };
                let Some(ldtk_project) = ldtk_project_assets.get(handle) else {
                    return;
                };
                let Some(selected) =
                    ldtk_project.find_raw_level_by_level_selection(&level_selection)
                else {
                    return;
                };
                let Some(level) = ldtk_project.get_raw_level_by_iid(level_iid.get()) else {
                    continue;
                };

                if selected.iid == level.iid {
                    let (size, offset) = viewport_geometry(
                        Vec2::new(level.px_wid as f32, level.px_hei as f32),
                        player_translation.truncate() - level_transform.translation.truncate(),
                    );
                    orthographic_projection.viewport_origin = Vec2::ZERO;
                    orthographic_projection.scaling_mode = ScalingMode::Fixed {
                        width: size.x,
                        height: size.y,
                    };
                    camera_transform.translation.x = offset.x;
                    camera_transform.translation.y = offset.y;

                    camera_transform.translation.x += level_transform.translation.x;
                    camera_transform.translation.y += level_transform.translation.y;
                }
            }
        }
    }
}

fn viewport_geometry(level: Vec2, player: Vec2) -> (Vec2, Vec2) {
    if level.x / level.y > ASPECT_RATIO {
        let height = (level.y / 9.).round().max(1.) * 9.;
        let width = height * ASPECT_RATIO;
        (
            Vec2::new(width, height),
            Vec2::new(
                (player.x - width / 2.).clamp(0., (level.x - width).max(0.)),
                0.,
            ),
        )
    } else {
        let width = (level.x / 16.).round().max(1.) * 16.;
        let height = width / ASPECT_RATIO;
        (
            Vec2::new(width, height),
            Vec2::new(
                0.,
                (player.y - height / 2.).clamp(0., (level.y - height).max(0.)),
            ),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiny_and_near_aspect_levels_have_valid_viewports() {
        for (width, height) in [
            (1., 1.),
            (15., 8.),
            (17., 9.),
            (31., 18.),
            (33., 18.),
            (320., 179.),
            (320., 181.),
        ] {
            let level = Vec2::new(width, height);
            for player in [Vec2::splat(-100.), level / 2., level * 2.] {
                let (size, offset) = viewport_geometry(level, player);
                assert!(size.is_finite() && size.x > 0. && size.y > 0.);
                assert!((size.x / size.y - ASPECT_RATIO).abs() < 0.0001);
                assert!(offset.is_finite() && offset.cmpge(Vec2::ZERO).all());
                assert!(offset.cmple((level - size).max(Vec2::ZERO)).all());
            }
        }
    }

    #[test]
    fn ordinary_scrolling_is_bounded() {
        assert_eq!(
            viewport_geometry(Vec2::new(2000., 900.), Vec2::splat(5000.)),
            (Vec2::new(1600., 900.), Vec2::new(400., 0.))
        );
        assert_eq!(
            viewport_geometry(Vec2::new(1600., 2000.), Vec2::splat(5000.)),
            (Vec2::new(1600., 900.), Vec2::new(0., 1100.))
        );
    }
}
