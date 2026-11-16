//! A simplified implementation of the classic game "Breakout".

use bevy::{prelude::*, sprite::MaterialMesh2dBundle};

mod physics;
mod stepping;

// These constants are defined in `Transform` units.
// Using the default 2D camera they correspond 1:1 with screen pixels.
const PADDLE_SIZE: Vec3 = Vec3::new(120.0, 20.0, 0.0);
const GAP_BETWEEN_PADDLE_AND_FLOOR: f32 = 60.0;
const PADDLE_SPEED: f32 = 500.0;
// How close can the paddle get to the wall
const PADDLE_PADDING: f32 = 10.0;

// We set the z-value of the ball to 1 so it renders on top in the case of overlapping sprites.
const BALL_STARTING_POSITION: Vec3 = Vec3::new(0.0, -50.0, 1.0);
const BALL_DIAMETER: f32 = 30.;
const BALL_SPEED: f32 = 400.0;
const INITIAL_BALL_DIRECTION: Vec2 = Vec2::new(0.5, -0.5);

const WALL_THICKNESS: f32 = 10.0;
// x coordinates
const LEFT_WALL: f32 = -450.;
const RIGHT_WALL: f32 = 450.;
// y coordinates
const BOTTOM_WALL: f32 = -300.;
const TOP_WALL: f32 = 300.;

const BRICK_SIZE: Vec2 = Vec2::new(100., 30.);
// These values are exact
const GAP_BETWEEN_PADDLE_AND_BRICKS: f32 = 270.0;
const GAP_BETWEEN_BRICKS: f32 = 5.0;
// These values are lower bounds, as the number of bricks is computed
const GAP_BETWEEN_BRICKS_AND_CEILING: f32 = 20.0;
const GAP_BETWEEN_BRICKS_AND_SIDES: f32 = 20.0;

const SCOREBOARD_FONT_SIZE: f32 = 40.0;
const SCOREBOARD_TEXT_PADDING: Val = Val::Px(5.0);

const BACKGROUND_COLOR: Color = Color::rgb(0.9, 0.9, 0.9);
const PADDLE_COLOR: Color = Color::rgb(0.3, 0.3, 0.7);
const BALL_COLOR: Color = Color::rgb(1.0, 0.5, 0.5);
const BRICK_COLOR: Color = Color::rgb(0.5, 0.5, 1.0);
const WALL_COLOR: Color = Color::rgb(0.8, 0.8, 0.8);
const TEXT_COLOR: Color = Color::rgb(0.5, 0.5, 1.0);
const SCORE_COLOR: Color = Color::rgb(1.0, 0.5, 0.5);

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(
            stepping::SteppingPlugin::default()
                .add_schedule(Update)
                .add_schedule(FixedUpdate)
                .at(Val::Percent(35.0), Val::Percent(50.0)),
        )
        .insert_resource(Scoreboard { score: 0 })
        .insert_resource(ClearColor(BACKGROUND_COLOR))
        .add_event::<CollisionEvent>()
        .add_systems(Startup, setup)
        // Add our gameplay simulation systems to the fixed timestep schedule
        // which runs at 64 Hz by default
        .add_systems(FixedUpdate, gameplay_systems())
        .add_systems(Update, (update_scoreboard, bevy::window::close_on_esc))
        .run();
}

// Keep the live game and headless schedule tests on the same ordered systems.
fn gameplay_systems() -> bevy::ecs::schedule::SystemConfigs {
    (move_paddle, check_for_collisions, play_collision_sound).chain()
}

#[derive(Component, Default)]
struct Paddle {
    velocity: Vec2,
}

#[derive(Component)]
struct Ball;

#[derive(Component, Deref, DerefMut)]
struct Velocity(Vec2);

#[derive(Component)]
struct Collider;

#[derive(Event, Default)]
struct CollisionEvent;

#[derive(Component)]
struct Brick;

#[derive(Resource)]
struct CollisionSound(Handle<AudioSource>);

// This bundle is a collection of the components that define a "wall" in our game
#[derive(Bundle)]
struct WallBundle {
    // You can nest bundles inside of other bundles like this
    // Allowing you to compose their functionality
    sprite_bundle: SpriteBundle,
    collider: Collider,
}

/// Which side of the arena is this wall located on?
enum WallLocation {
    Left,
    Right,
    Bottom,
    Top,
}

impl WallLocation {
    fn position(&self) -> Vec2 {
        match self {
            WallLocation::Left => Vec2::new(LEFT_WALL, 0.),
            WallLocation::Right => Vec2::new(RIGHT_WALL, 0.),
            WallLocation::Bottom => Vec2::new(0., BOTTOM_WALL),
            WallLocation::Top => Vec2::new(0., TOP_WALL),
        }
    }

    fn size(&self) -> Vec2 {
        let arena_height = TOP_WALL - BOTTOM_WALL;
        let arena_width = RIGHT_WALL - LEFT_WALL;
        // Make sure we haven't messed up our constants
        assert!(arena_height > 0.0);
        assert!(arena_width > 0.0);

        match self {
            WallLocation::Left | WallLocation::Right => {
                Vec2::new(WALL_THICKNESS, arena_height + WALL_THICKNESS)
            }
            WallLocation::Bottom | WallLocation::Top => {
                Vec2::new(arena_width + WALL_THICKNESS, WALL_THICKNESS)
            }
        }
    }
}

impl WallBundle {
    // This "builder method" allows us to reuse logic across our wall entities,
    // making our code easier to read and less prone to bugs when we change the logic
    fn new(location: WallLocation) -> WallBundle {
        WallBundle {
            sprite_bundle: SpriteBundle {
                transform: Transform {
                    // We need to convert our Vec2 into a Vec3, by giving it a z-coordinate
                    // This is used to determine the order of our sprites
                    translation: location.position().extend(0.0),
                    // The z-scale of 2D objects must always be 1.0,
                    // or their ordering will be affected in surprising ways.
                    // See https://github.com/bevyengine/bevy/issues/4149
                    scale: location.size().extend(1.0),
                    ..default()
                },
                sprite: Sprite {
                    color: WALL_COLOR,
                    ..default()
                },
                ..default()
            },
            collider: Collider,
        }
    }
}

// This resource tracks the game's score
#[derive(Resource)]
struct Scoreboard {
    score: usize,
}

#[derive(Component)]
struct ScoreboardUi;

// Add the game's entities to our world
fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
    asset_server: Res<AssetServer>,
) {
    // Camera
    commands.spawn(Camera2dBundle::default());

    // Sound
    let ball_collision_sound = asset_server.load("sounds/breakout_collision.ogg");
    commands.insert_resource(CollisionSound(ball_collision_sound));

    // Paddle
    let paddle_y = BOTTOM_WALL + GAP_BETWEEN_PADDLE_AND_FLOOR;

    commands.spawn((
        SpriteBundle {
            transform: Transform {
                translation: Vec3::new(0.0, paddle_y, 0.0),
                scale: PADDLE_SIZE,
                ..default()
            },
            sprite: Sprite {
                color: PADDLE_COLOR,
                ..default()
            },
            ..default()
        },
        Paddle::default(),
        Collider,
    ));

    // Ball
    commands.spawn((
        MaterialMesh2dBundle {
            mesh: meshes.add(Circle::default()).into(),
            material: materials.add(BALL_COLOR),
            transform: Transform::from_translation(BALL_STARTING_POSITION)
                .with_scale(Vec2::splat(BALL_DIAMETER).extend(1.)),
            ..default()
        },
        Ball,
        Velocity(INITIAL_BALL_DIRECTION.normalize() * BALL_SPEED),
    ));

    // Scoreboard
    commands.spawn((
        ScoreboardUi,
        TextBundle::from_sections([
            TextSection::new(
                "Score: ",
                TextStyle {
                    font_size: SCOREBOARD_FONT_SIZE,
                    color: TEXT_COLOR,
                    ..default()
                },
            ),
            TextSection::from_style(TextStyle {
                font_size: SCOREBOARD_FONT_SIZE,
                color: SCORE_COLOR,
                ..default()
            }),
        ])
        .with_style(Style {
            position_type: PositionType::Absolute,
            top: SCOREBOARD_TEXT_PADDING,
            left: SCOREBOARD_TEXT_PADDING,
            ..default()
        }),
    ));

    // Walls
    commands.spawn(WallBundle::new(WallLocation::Left));
    commands.spawn(WallBundle::new(WallLocation::Right));
    commands.spawn(WallBundle::new(WallLocation::Bottom));
    commands.spawn(WallBundle::new(WallLocation::Top));

    // Bricks
    let total_width_of_bricks = (RIGHT_WALL - LEFT_WALL) - 2. * GAP_BETWEEN_BRICKS_AND_SIDES;
    let bottom_edge_of_bricks = paddle_y + GAP_BETWEEN_PADDLE_AND_BRICKS;
    let total_height_of_bricks = TOP_WALL - bottom_edge_of_bricks - GAP_BETWEEN_BRICKS_AND_CEILING;

    assert!(total_width_of_bricks > 0.0);
    assert!(total_height_of_bricks > 0.0);

    // Given the space available, compute how many rows and columns of bricks we can fit
    let n_columns = (total_width_of_bricks / (BRICK_SIZE.x + GAP_BETWEEN_BRICKS)).floor() as usize;
    let n_rows = (total_height_of_bricks / (BRICK_SIZE.y + GAP_BETWEEN_BRICKS)).floor() as usize;
    let n_vertical_gaps = n_columns - 1;

    // Because we need to round the number of columns,
    // the space on the top and sides of the bricks only captures a lower bound, not an exact value
    let center_of_bricks = (LEFT_WALL + RIGHT_WALL) / 2.0;
    let left_edge_of_bricks = center_of_bricks
        // Space taken up by the bricks
        - (n_columns as f32 / 2.0 * BRICK_SIZE.x)
        // Space taken up by the gaps
        - n_vertical_gaps as f32 / 2.0 * GAP_BETWEEN_BRICKS;

    // In Bevy, the `translation` of an entity describes the center point,
    // not its bottom-left corner
    let offset_x = left_edge_of_bricks + BRICK_SIZE.x / 2.;
    let offset_y = bottom_edge_of_bricks + BRICK_SIZE.y / 2.;

    for row in 0..n_rows {
        for column in 0..n_columns {
            let brick_position = Vec2::new(
                offset_x + column as f32 * (BRICK_SIZE.x + GAP_BETWEEN_BRICKS),
                offset_y + row as f32 * (BRICK_SIZE.y + GAP_BETWEEN_BRICKS),
            );

            // brick
            commands.spawn((
                SpriteBundle {
                    sprite: Sprite {
                        color: BRICK_COLOR,
                        ..default()
                    },
                    transform: Transform {
                        translation: brick_position.extend(0.0),
                        scale: Vec3::new(BRICK_SIZE.x, BRICK_SIZE.y, 1.0),
                        ..default()
                    },
                    ..default()
                },
                Brick,
                Collider,
            ));
        }
    }
}

fn move_paddle(
    keyboard_input: Res<ButtonInput<KeyCode>>,
    mut query: Query<(&mut Transform, &mut Paddle)>,
    time: Res<Time>,
) {
    let (mut paddle_transform, mut paddle) = query.single_mut();
    let start = paddle_transform.translation.truncate();
    let mut direction = 0.0;

    if keyboard_input.pressed(KeyCode::ArrowLeft) {
        direction -= 1.0;
    }

    if keyboard_input.pressed(KeyCode::ArrowRight) {
        direction += 1.0;
    }

    // Calculate the new horizontal paddle position based on player input
    let new_paddle_position =
        paddle_transform.translation.x + direction * PADDLE_SPEED * time.delta_seconds();

    // Update the paddle position,
    // making sure it doesn't cause the paddle to leave the arena
    let left_bound = LEFT_WALL + WALL_THICKNESS / 2.0 + PADDLE_SIZE.x / 2.0 + PADDLE_PADDING;
    let right_bound = RIGHT_WALL - WALL_THICKNESS / 2.0 - PADDLE_SIZE.x / 2.0 - PADDLE_PADDING;

    paddle_transform.translation.x = new_paddle_position.clamp(left_bound, right_bound);
    paddle.velocity = if time.delta_seconds() > 0. {
        (paddle_transform.translation.truncate() - start) / time.delta_seconds()
    } else {
        Vec2::ZERO
    };
}

fn update_scoreboard(scoreboard: Res<Scoreboard>, mut query: Query<&mut Text, With<ScoreboardUi>>) {
    let mut text = query.single_mut();
    text.sections[1].value = scoreboard.score.to_string();
}

// The exclusion makes ball/collider transform access disjoint to Bevy's scheduler.
type Colliders<'w, 's> = Query<
    'w,
    's,
    (
        Entity,
        &'static Transform,
        Option<&'static Brick>,
        Option<&'static Paddle>,
    ),
    (With<Collider>, Without<Ball>),
>;

fn check_for_collisions(
    mut commands: Commands,
    mut scoreboard: ResMut<Scoreboard>,
    mut ball_query: Query<(&mut Velocity, &mut Transform), With<Ball>>,
    collider_query: Colliders,
    time: Res<Time>,
    mut collision_events: EventWriter<CollisionEvent>,
) {
    let (mut ball_velocity, mut ball_transform) = ball_query.single_mut();
    let duration = time.delta_seconds();
    let obstacles: Vec<_> = collider_query
        .iter()
        .map(|(entity, transform, brick, paddle)| {
            let velocity = paddle.map_or(Vec2::ZERO, |paddle| paddle.velocity);
            physics::Obstacle {
                entity,
                center: transform.translation.truncate() - velocity * duration,
                half_size: transform.scale.truncate() / 2.,
                velocity,
                brick: brick.is_some(),
            }
        })
        .collect();
    let mut position = ball_transform.translation.truncate();
    for entity in physics::advance_ball(
        &mut position,
        &mut ball_velocity.0,
        BALL_DIAMETER / 2.,
        duration,
        &obstacles,
    ) {
        collision_events.send_default();
        if collider_query.get(entity).unwrap().2.is_some() {
            scoreboard.score += 1;
            commands.entity(entity).despawn();
        }
    }
    ball_transform.translation.x = position.x;
    ball_transform.translation.y = position.y;
}

fn play_collision_sound(
    mut commands: Commands,
    mut collision_events: EventReader<CollisionEvent>,
    sound: Res<CollisionSound>,
) {
    // Coalesce contacts into one sound per fixed tick.
    if !collision_events.is_empty() {
        // This prevents consumed events replaying on the next fixed tick.
        collision_events.clear();
        commands.spawn(AudioBundle {
            source: sound.0.clone(),
            // auto-despawn the entity when playback finishes
            settings: PlaybackSettings::DESPAWN,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, PartialEq, Eq, Copy, Clone)]
    enum Collision {
        Left,
        Right,
        Top,
        Bottom,
    }

    // Exercise the actual fixed schedule, including paddle motion and sound draining.
    fn motion_app(position: Vec2, velocity: Vec2) -> (App, Entity) {
        let mut app = App::new();
        app.insert_resource(Time::<()>::default())
            .insert_resource(ButtonInput::<KeyCode>::default())
            .insert_resource(Scoreboard { score: 0 })
            .insert_resource(CollisionSound(Handle::default()))
            .add_event::<CollisionEvent>()
            .add_systems(FixedUpdate, gameplay_systems());
        let ball = app
            .world
            .spawn((
                Ball,
                Transform::from_translation(position.extend(1.)),
                Velocity(velocity),
            ))
            .id();
        app.world.spawn((
            Paddle::default(),
            Transform::from_xyz(-100., 0., 0.).with_scale(Vec3::new(20., 20., 1.)),
        ));
        (app, ball)
    }

    fn tick(app: &mut App, dt: f64) {
        app.world
            .resource_mut::<Time>()
            .advance_by(std::time::Duration::from_secs_f64(dt));
        app.world.run_schedule(FixedUpdate);
    }

    fn ball_state(app: &App, ball: Entity) -> (Vec2, Vec2) {
        (
            app.world
                .get::<Transform>(ball)
                .unwrap()
                .translation
                .truncate(),
            app.world.get::<Velocity>(ball).unwrap().0,
        )
    }

    fn assert_vec_close(actual: Vec2, expected: Vec2) {
        assert!(
            (actual - expected).length() < 0.002,
            "{actual:?} != {expected:?}"
        );
    }

    #[test]
    fn swept_first_contact_blocks_wall_and_thin_brick_crossings() {
        for brick in [false, true] {
            let (mut app, ball) = motion_app(Vec2::new(-50., 50.), Vec2::new(1000., 0.));
            let obstacle = app
                .world
                .spawn((
                    Collider,
                    Transform::from_xyz(0., 50., 0.).with_scale(Vec3::new(2., 200., 1.)),
                ))
                .id();
            if brick {
                app.world.entity_mut(obstacle).insert(Brick);
            }
            // A brick behind the first obstacle must never be scored through it.
            let hidden = app
                .world
                .spawn((
                    Collider,
                    Brick,
                    Transform::from_xyz(25., 50., 0.).with_scale(Vec3::new(2., 200., 1.)),
                ))
                .id();
            tick(&mut app, 0.1);
            let (position, velocity) = ball_state(&app, ball);
            assert_vec_close(position, Vec2::new(-82., 50.));
            assert_vec_close(velocity, Vec2::new(-1000., 0.));
            assert_eq!(app.world.resource::<Scoreboard>().score, usize::from(brick));
            assert!(app.world.get_entity(hidden).is_some());
            assert_eq!(app.world.get_entity(obstacle).is_none(), brick);
            assert_eq!(
                app.world
                    .query::<&Handle<AudioSource>>()
                    .iter(&app.world)
                    .count(),
                1
            );
        }
    }

    #[test]
    fn swept_wall_bounces_agree_across_step_partitions() {
        let simulate = |steps: usize| {
            let (mut app, ball) = motion_app(Vec2::new(0., 50.), Vec2::new(1000., 0.));
            for x in [-50., 50.] {
                app.world.spawn((
                    Collider,
                    Transform::from_xyz(x, 50., 0.).with_scale(Vec3::new(2., 100., 1.)),
                ));
            }
            for _ in 0..steps {
                tick(&mut app, 0.2 / steps as f64);
            }
            ball_state(&app, ball)
        };
        let whole = simulate(1);
        assert_vec_close(whole.0, Vec2::new(4., 50.));
        assert_vec_close(whole.1, Vec2::new(-1000., 0.));
        for steps in [2, 20, 200] {
            let split = simulate(steps);
            assert_vec_close(split.0, whole.0);
            assert_vec_close(split.1, whole.1);
        }
    }

    #[test]
    fn moving_paddle_uses_relative_swept_contact_across_step_partitions() {
        let simulate = |steps: usize| {
            let (mut app, ball) = motion_app(Vec2::new(-50., 0.), Vec2::ZERO);
            let paddle = app
                .world
                .query_filtered::<Entity, With<Paddle>>()
                .single(&app.world);
            app.world.entity_mut(paddle).insert(Collider);
            app.world
                .resource_mut::<ButtonInput<KeyCode>>()
                .press(KeyCode::ArrowRight);
            for _ in 0..steps {
                tick(&mut app, 0.1 / steps as f64);
            }
            let sounds = app
                .world
                .query::<&Handle<AudioSource>>()
                .iter(&app.world)
                .count();
            (ball_state(&app, ball), sounds)
        };
        // The paddle contacts the resting ball halfway through the step and
        // pushes it at its own speed; it adds no energy beyond that push.
        let (whole, sounds) = simulate(1);
        assert_vec_close(whole.0, Vec2::new(-25., 0.));
        assert_vec_close(whole.1, Vec2::new(PADDLE_SPEED, 0.));
        assert_eq!(sounds, 1);
        for steps in [2, 10, 100] {
            let (split, sounds) = simulate(steps);
            assert_vec_close(split.0, whole.0);
            assert_vec_close(split.1, whole.1);
            // Riding along the pushing paddle is one contact, not one per tick.
            assert_eq!(sounds, 1, "steps={steps}");
        }
    }

    #[test]
    fn paddle_wall_squeeze_keeps_ball_speed_bounded() {
        let (mut app, ball) = motion_app(Vec2::new(390., -200.), Vec2::new(0., -BALL_SPEED));
        let paddle = app
            .world
            .query_filtered::<Entity, With<Paddle>>()
            .single(&app.world);
        app.world.entity_mut(paddle).insert((
            Collider,
            Transform::from_xyz(300., -240., 0.).with_scale(PADDLE_SIZE),
        ));
        app.world.spawn((
            Collider,
            Transform::from_xyz(RIGHT_WALL, 0., 0.).with_scale(Vec3::new(WALL_THICKNESS, 600., 1.)),
        ));
        app.world
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::ArrowRight);
        let limit = Vec2::new(PADDLE_SPEED, BALL_SPEED).length() + 1.;
        for _ in 0..128 {
            tick(&mut app, 1. / 64.);
            let (position, velocity) = ball_state(&app, ball);
            assert!(position.is_finite() && velocity.is_finite());
            assert!(velocity.length() <= limit, "{position:?} {velocity:?}");
        }
    }

    fn overlap_app(position: Vec2, velocity: Vec2) -> (App, Entity) {
        let (mut app, ball) = motion_app(position, velocity);
        app.world.spawn((
            Collider,
            Transform::default().with_scale(Vec3::new(40., 20., 1.)),
        ));
        (app, ball)
    }

    fn assert_outside_box(position: Vec2) {
        let offset = position - position.clamp(Vec2::new(-20., -10.), Vec2::new(20., 10.));
        assert!(
            position.is_finite() && offset.length() >= 15. - 1.0e-5,
            "still penetrating: {position:?}"
        );
    }

    #[test]
    fn overlap_recovery_separates_embedded_and_on_wall_balls_and_retires_sound() {
        for (start, incoming, expected, outgoing) in [
            (Vec2::ZERO, Vec2::ZERO, Vec2::new(0., -25.), Vec2::ZERO),
            (
                Vec2::new(0., -10.),
                Vec2::ZERO,
                Vec2::new(0., -25.),
                Vec2::ZERO,
            ),
            (
                Vec2::new(0., -10.),
                Vec2::new(0., 10.),
                Vec2::new(0., -25.15625),
                Vec2::new(0., -10.),
            ),
            (
                Vec2::new(19., 0.),
                Vec2::new(-10., 0.),
                Vec2::new(35.15625, 0.),
                Vec2::new(10., 0.),
            ),
            (
                Vec2::new(21., 11.),
                Vec2::ZERO,
                Vec2::new(20., 10.) + Vec2::ONE.normalize() * 15.,
                Vec2::ZERO,
            ),
        ] {
            let (mut app, ball) = overlap_app(start, incoming);
            tick(&mut app, 1. / 64.);
            let (position, velocity) = ball_state(&app, ball);
            assert_outside_box(position);
            assert_vec_close(position, expected);
            assert_vec_close(velocity, outgoing);
            for _ in 0..32 {
                tick(&mut app, 1. / 64.);
                let (position, velocity) = ball_state(&app, ball);
                assert_outside_box(position);
                assert!(velocity.is_finite());
            }
            assert_eq!(
                app.world
                    .query::<&Handle<AudioSource>>()
                    .iter(&app.world)
                    .count(),
                1
            );
        }
    }

    #[test]
    fn resting_and_tangent_contacts_do_not_replay_impact_sound() {
        for velocity in [Vec2::ZERO, Vec2::new(10., 0.)] {
            let start = Vec2::new(0., -25.);
            let (mut app, ball) = overlap_app(start, velocity);
            for _ in 0..32 {
                tick(&mut app, 1. / 64.);
            }
            let (position, outgoing) = ball_state(&app, ball);
            assert_outside_box(position);
            assert_vec_close(position, start + velocity * 0.5);
            assert_vec_close(outgoing, velocity);
            assert_eq!(
                app.world
                    .query::<&Handle<AudioSource>>()
                    .iter(&app.world)
                    .count(),
                0
            );
        }
    }

    #[test]
    fn simultaneous_overlap_recovery_is_independent_of_entity_order() {
        let simulate = |reverse: bool| {
            let (mut app, ball) = motion_app(Vec2::ZERO, Vec2::splat(100.));
            let mut boxes = [
                (Vec2::new(10., 0.), Vec2::new(2., 100.)),
                (Vec2::new(0., 10.), Vec2::new(100., 2.)),
            ];
            if reverse {
                boxes.reverse();
            }
            for (center, size) in boxes {
                app.world.spawn((
                    Collider,
                    Transform::from_translation(center.extend(0.)).with_scale(size.extend(1.)),
                ));
            }
            tick(&mut app, 1. / 64.);
            ball_state(&app, ball)
        };
        let forward = simulate(false);
        let reverse = simulate(true);
        assert_vec_close(forward.0, Vec2::splat(-7.5625));
        assert_vec_close(forward.1, Vec2::splat(-100.));
        assert_vec_close(reverse.0, forward.0);
        assert_vec_close(reverse.1, forward.1);
    }

    fn opposing_brick_contacts(reverse: bool, vertical: bool) -> (Vec2, usize, usize, usize) {
        let mut app = App::new();
        app.insert_resource(Scoreboard { score: 0 })
            .insert_resource(Time::<()>::default())
            .add_event::<CollisionEvent>()
            .add_systems(FixedUpdate, check_for_collisions);
        let ball = app
            .world
            .spawn((Ball, Transform::default(), Velocity(Vec2::new(100., 25.))))
            .id();
        let mut positions = [-12., 12.];
        if reverse {
            positions.reverse();
        }
        for x in positions {
            app.world.spawn((
                Collider,
                Brick,
                if vertical {
                    Transform::from_xyz(0., x, 0.).with_scale(Vec3::new(40., 20., 1.))
                } else {
                    Transform::from_xyz(x, 0., 0.).with_scale(Vec3::new(20., 40., 1.))
                },
            ));
        }
        app.world.run_schedule(FixedUpdate);
        (
            app.world.get::<Velocity>(ball).unwrap().0,
            app.world.resource::<Scoreboard>().score,
            app.world.query::<&Brick>().iter(&app.world).count(),
            app.world.resource::<Events<CollisionEvent>>().len(),
        )
    }

    #[test]
    fn simultaneous_contacts_use_incoming_velocity_in_either_entity_order() {
        let expected = (Vec2::new(-100., 25.), 2, 0, 2);
        assert_eq!(opposing_brick_contacts(false, false), expected);
        assert_eq!(opposing_brick_contacts(true, false), expected);
        let expected = (Vec2::new(100., -25.), 2, 0, 2);
        assert_eq!(opposing_brick_contacts(false, true), expected);
        assert_eq!(opposing_brick_contacts(true, true), expected);
    }

    #[test]
    fn contact_geometry_matches_face_corner_tangent_and_inside_oracles() {
        // Coordinates are relative to a box with half extents (2, 1).
        // The 3/4/5 corner triangle uses exactly representable binary values.
        let cases = [
            (Vec2::new(-3., 0.), 1., Some(Collision::Left)),
            (Vec2::new(3., 0.), 1., Some(Collision::Right)),
            (Vec2::new(0., 2.), 1., Some(Collision::Top)),
            (Vec2::new(0., -2.), 1., Some(Collision::Bottom)),
            (Vec2::new(-3.25, 0.), 1., None),
            (Vec2::new(3.25, 0.), 1., None),
            (Vec2::new(0., 2.25), 1., None),
            (Vec2::new(0., -2.25), 1., None),
            (Vec2::new(2.75, 2.), 1.25, Some(Collision::Top)),
            (Vec2::new(-2.75, 2.), 1.25, Some(Collision::Top)),
            (Vec2::new(2.75, -2.), 1.25, Some(Collision::Bottom)),
            (Vec2::new(-2.75, -2.), 1.25, Some(Collision::Bottom)),
            (Vec2::new(3., 1.75), 1.25, Some(Collision::Right)),
            (Vec2::new(-3., 1.75), 1.25, Some(Collision::Left)),
            (Vec2::new(3., -1.75), 1.25, Some(Collision::Right)),
            (Vec2::new(-3., -1.75), 1.25, Some(Collision::Left)),
            (Vec2::new(3., 2.), 1.25, None),
            (Vec2::new(2.5, 1.5), 1., Some(Collision::Top)),
            (Vec2::new(-2.5, -1.5), 1., Some(Collision::Bottom)),
            (Vec2::ZERO, 0.25, Some(Collision::Bottom)),
            (Vec2::new(1., 0.5), 0.25, Some(Collision::Top)),
        ];
        for center in [Vec2::ZERO, Vec2::new(32., -16.)] {
            for scale in [0.5, 1., 4.] {
                for (offset, radius, expected) in cases {
                    let position = center + offset * scale;
                    let actual = physics::sweep_circle(
                        position - center,
                        Vec2::ZERO,
                        radius * scale,
                        Vec2::new(2., 1.) * scale,
                        0.,
                        true,
                    )
                    .map(|hit| {
                        let normal = hit.normal;
                        if normal.x.abs() > normal.y.abs() {
                            if normal.x < 0. {
                                Collision::Left
                            } else {
                                Collision::Right
                            }
                        } else if normal.y > 0. {
                            Collision::Top
                        } else {
                            Collision::Bottom
                        }
                    });
                    assert_eq!(
                        actual, expected,
                        "offset={offset:?}, radius={radius}, center={center:?}, scale={scale}"
                    );
                }
            }
        }
    }

    #[test]
    fn catch_up_ticks_despawn_score_once_and_drain_sound_events() {
        let mut app = App::new();
        let sound = Handle::<AudioSource>::default();
        let mut time = Time::<()>::default();
        time.advance_by(std::time::Duration::from_secs_f64(1. / 64.));
        app.insert_resource(time)
            .insert_resource(ButtonInput::<KeyCode>::default())
            .insert_resource(Scoreboard { score: 0 })
            .insert_resource(CollisionSound(sound.clone()))
            .add_event::<CollisionEvent>()
            .add_systems(FixedUpdate, gameplay_systems());
        let ball = app
            .world
            .spawn((Ball, Transform::default(), Velocity(Vec2::new(100., 100.))))
            .id();
        app.world
            .spawn((Paddle::default(), Transform::from_xyz(0., -200., 0.)));
        let brick = app
            .world
            .spawn((
                Brick,
                Collider,
                Transform::from_xyz(12., 0., 0.).with_scale(Vec3::new(20., 40., 1.)),
            ))
            .id();
        let wall = app
            .world
            .spawn((
                Collider,
                Transform::from_xyz(0., 12., 0.).with_scale(Vec3::new(40., 20., 1.)),
            ))
            .id();

        // All ticks occur without an Update/render or event-maintenance pass.
        for tick in 0..3 {
            if tick == 1 {
                // Stay at the hit brick's location for another tick: failure to
                // flush despawn commands would incorrectly award it again.
                app.world.get_mut::<Transform>(ball).unwrap().translation = Vec3::ZERO;
                app.world.get_mut::<Velocity>(ball).unwrap().0 = Vec2::new(100., 100.);
            }
            if tick == 2 {
                // A quiet tick must not replay either preceding tick's events.
                app.world.get_mut::<Transform>(ball).unwrap().translation =
                    Vec3::new(-200., -100., 0.);
            }
            app.world.run_schedule(FixedUpdate);
            assert!(app.world.get_entity(brick).is_none());
            assert!(app.world.get_entity(wall).is_some());
            assert_eq!(app.world.resource::<Scoreboard>().score, 1);
            let expected_sounds = if tick == 0 { 1 } else { 2 };
            let mut audio = app
                .world
                .query::<(&Handle<AudioSource>, &PlaybackSettings)>();
            assert_eq!(audio.iter(&app.world).count(), expected_sounds);
            for (source, settings) in audio.iter(&app.world) {
                assert_eq!(source, &sound);
                assert!(matches!(settings.mode, bevy::audio::PlaybackMode::Despawn));
            }
        }
    }
}
