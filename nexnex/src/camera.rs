use bevy::camera::ScalingMode;
use bevy::prelude::*;
use bevy_ecs_ldtk::prelude::*;

use crate::player::Player;

const ASPECT_RATIO: f32 = 16. / 9.;

#[derive(Component)]
pub(crate) struct PlatformerCamera;

#[allow(clippy::type_complexity)]
pub fn camera_fit_inside_current_level(
    mut camera_query: Query<
        (
            &mut Projection,
            &mut Transform,
            &mut GlobalTransform,
            Option<&ChildOf>,
        ),
        (With<PlatformerCamera>, Without<Player>),
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
    if level.px_wid <= 0 || level.px_hei <= 0 {
        return;
    }
    let Some((level_transform, _)) = level_query.iter().find(|(_, iid)| iid.get() == &level.iid)
    else {
        return;
    };
    let Ok((projection, mut camera_transform, mut camera_global, parent)) =
        camera_query.single_mut()
    else {
        return;
    };
    let Some(mut orthographic) = projection.filter_map_unchanged(|projection| match projection {
        Projection::Orthographic(orthographic) => Some(orthographic),
        _ => None,
    }) else {
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
    let (position, parent_transform) = if let Some(parent) = parent {
        let Ok(parent_transform) = globals.get(parent.parent()) else {
            return;
        };
        (
            parent_transform
                .affine()
                .inverse()
                .transform_point3(position),
            Some(parent_transform),
        )
    } else {
        (position, None)
    };
    if !position.is_finite() {
        return;
    }
    let mut fitted_transform = *camera_transform;
    fitted_transform.translation.x = position.x;
    fitted_transform.translation.y = position.y;
    let fitted_global = parent_transform.map_or_else(
        || GlobalTransform::from(fitted_transform),
        |parent| parent.mul_transform(fitted_transform),
    );

    if orthographic.viewport_origin != Vec2::ZERO
        || !matches!(orthographic.scaling_mode, ScalingMode::Fixed { width, height }
            if width == size.x && height == size.y)
    {
        orthographic.viewport_origin = Vec2::ZERO;
        orthographic.scaling_mode = ScalingMode::Fixed {
            width: size.x,
            height: size.y,
        };
    }
    camera_transform.set_if_neq(fitted_transform);
    // This system follows propagated world transforms. Publish the camera's
    // global pose too, so extraction sees this frame's target without a frame lag;
    // main.rs orders it before the projection update and frustum culling.
    camera_global.set_if_neq(fitted_global);
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
    use crate::testing;
    use bevy::ecs::change_detection::Tick;
    use bevy_ecs_ldtk::ldtk::Level;

    fn camera_app(level: Level) -> (App, Handle<LdtkProject>, Entity, Entity) {
        let (mut app, handle) = testing::project_app(vec![level]);
        app.insert_resource(LevelSelection::iid("synthetic-level"))
            .add_systems(
                PostUpdate,
                camera_fit_inside_current_level.after(bevy::transform::TransformSystems::Propagate),
            );
        let world = app.world_mut();
        world.spawn(LdtkProjectHandle::from(handle.clone()));
        world.spawn((LevelIid::new("synthetic-level"), Transform::default()));
        let player = world.spawn((Player, Transform::default())).id();
        let camera = world
            .spawn((
                PlatformerCamera,
                Projection::Orthographic(OrthographicProjection::default_2d()),
                Transform::from_xyz(20., 30., 99.),
            ))
            .id();
        (app, handle, player, camera)
    }

    fn camera_ticks(app: &App, camera: Entity) -> (Tick, Tick, Tick) {
        let camera = app.world().entity(camera);
        (
            camera.get_ref::<Projection>().unwrap().last_changed(),
            camera.get_ref::<Transform>().unwrap().last_changed(),
            camera.get_ref::<GlobalTransform>().unwrap().last_changed(),
        )
    }

    #[test]
    fn camera_fit_marks_only_changed_components() {
        let (mut app, _, player, camera) = camera_app(Level {
            px_wid: 512,
            ..testing::level()
        });

        app.update();
        // Let propagation consume the local transform from the initial fit.
        app.update();
        let fitted = camera_ticks(&app, camera);
        for _ in 0..2 {
            app.update();
            assert_eq!(
                camera_ticks(&app, camera),
                fitted,
                "stationary fit changed camera ticks"
            );
        }

        app.world_mut()
            .get_mut::<Transform>(player)
            .unwrap()
            .translation
            .x = 300.;
        app.update();
        let moved = camera_ticks(&app, camera);
        assert_eq!(moved.0, fitted.0);
        assert_ne!(moved.1, fitted.1);
        assert_ne!(moved.2, fitted.2);
        let camera = app.world().entity(camera);
        let expected = Vec3::new(188., 0., 99.);
        assert_eq!(camera.get::<Transform>().unwrap().translation, expected);
        assert_eq!(
            camera.get::<GlobalTransform>().unwrap().translation(),
            expected
        );
    }

    #[test]
    fn camera_fit_keeps_last_valid_state_for_nonpositive_level_size() {
        let (mut app, handle, _, camera) = camera_app(testing::level());
        app.update();
        app.update();
        let fitted = camera_ticks(&app, camera);

        for (px_wid, px_hei) in [(-64, 128), (128, -64), (0, 128), (128, 0)] {
            let (replacement, replacement_handle) = testing::project_app(vec![Level {
                px_wid,
                px_hei,
                ..testing::level()
            }]);
            let project = replacement
                .world()
                .resource::<Assets<LdtkProject>>()
                .get(&replacement_handle)
                .unwrap()
                .clone();
            app.world_mut()
                .resource_mut::<Assets<LdtkProject>>()
                .insert(handle.id(), project)
                .unwrap();

            app.update();
            assert_eq!(camera_ticks(&app, camera), fitted, "size {px_wid}×{px_hei}");
        }
    }

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
