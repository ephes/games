use bevy::camera::ScalingMode;
use bevy::prelude::*;
use bevy_ecs_ldtk::prelude::*;

use crate::player::Player;

const ASPECT_RATIO: f32 = 16. / 9.;

#[allow(clippy::type_complexity)]
pub fn camera_fit_inside_current_level(
    mut camera_query: Query<
        (
            &mut Projection,
            &mut Transform,
            &mut GlobalTransform,
            Option<&ChildOf>,
        ),
        Without<Player>,
    >,
    player_query: Query<&GlobalTransform, (With<Player>, Without<Projection>)>,
    level_query: Query<(&GlobalTransform, &LevelIid), (Without<Projection>, Without<Player>)>,
    globals: Query<&GlobalTransform, Without<Projection>>,
    ldtk_projects: Query<&LdtkProjectHandle>,
    level_selection: Res<LevelSelection>,
    ldtk_project_assets: Res<Assets<LdtkProject>>,
) {
    let Ok(player) = player_query.single() else {
        return;
    };
    let Ok(handle) = ldtk_projects.single() else {
        return;
    };
    let Some(project) = ldtk_project_assets.get(handle) else {
        return;
    };
    let Some(level) = project.find_raw_level_by_level_selection(&level_selection) else {
        return;
    };
    let Some((level_transform, _)) = level_query.iter().find(|(_, iid)| iid.get() == &level.iid)
    else {
        return;
    };
    let Ok((mut projection, mut camera_transform, mut camera_global, parent)) =
        camera_query.single_mut()
    else {
        return;
    };
    let Projection::Orthographic(ref mut orthographic) = *projection else {
        return;
    };
    let mut min = Vec2::splat(f32::INFINITY);
    let mut max = Vec2::splat(f32::NEG_INFINITY);
    for corner in [
        Vec3::ZERO,
        Vec3::new(level.px_wid as f32, 0., 0.),
        Vec3::new(0., level.px_hei as f32, 0.),
        Vec3::new(level.px_wid as f32, level.px_hei as f32, 0.),
    ] {
        let point = level_transform.transform_point(corner).truncate();
        min = min.min(point);
        max = max.max(point);
    }
    if !min.is_finite() || !max.is_finite() || (max - min).min_element() <= 0. {
        return;
    }
    let (size, offset) = viewport_geometry(max - min, player.translation().truncate() - min);
    let position = (min + offset).extend(0.);
    let position = if let Some(parent) = parent {
        let Ok(transform) = globals.get(parent.parent()) else {
            return;
        };
        transform.affine().inverse().transform_point3(position)
    } else {
        position
    };
    if !position.is_finite() {
        return;
    }
    orthographic.viewport_origin = Vec2::ZERO;
    orthographic.scaling_mode = ScalingMode::Fixed {
        width: size.x,
        height: size.y,
    };
    camera_transform.translation.x = position.x;
    camera_transform.translation.y = position.y;
    // This system follows propagated world transforms. Publish the camera's
    // global pose too, so extraction sees this frame's target without a frame lag;
    // main.rs orders it before the projection update and frustum culling.
    *camera_global = parent
        .and_then(|parent| globals.get(parent.parent()).ok())
        .map(|parent| parent.mul_transform(*camera_transform))
        .unwrap_or_else(|| GlobalTransform::from(*camera_transform));
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
