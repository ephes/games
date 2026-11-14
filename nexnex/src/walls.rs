use bevy::prelude::*;
use bevy_ecs_ldtk::prelude::*;
use bevy_rapier2d::prelude::*;
use std::collections::{HashMap, HashSet};

#[derive(Copy, Clone, Eq, PartialEq, Debug, Default, Component)]
pub struct Wall;

#[derive(Clone, Debug, Default, Bundle, LdtkIntCell)]
pub struct WallBundle {
    wall: Wall,
}

#[derive(Component)]
struct WallCollision(Entity);

#[derive(Clone, PartialEq, Eq)]
struct LayerWalls {
    level: Entity,
    width: i32,
    height: i32,
    grid_size: i32,
    offset: IVec2,
    cells: HashSet<GridCoords>,
}

#[cfg(test)]
thread_local! {
    static PLATE_WORK: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
    static CELL_PROBES: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

#[derive(Clone, Eq, Debug, Default)]
#[cfg_attr(not(test), derive(PartialEq, Hash))]
struct Plate {
    left: i32,
    right: i32,
}

// Instrument the actual identity operations in tests, including Vec scans and
// hash-table lookups, without adding counters to production builds.
#[cfg(test)]
impl PartialEq for Plate {
    fn eq(&self, other: &Self) -> bool {
        PLATE_WORK.with(|count| count.set(count.get() + 1));
        self.left == other.left && self.right == other.right
    }
}

#[cfg(test)]
impl std::hash::Hash for Plate {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        PLATE_WORK.with(|count| count.set(count.get() + 1));
        std::hash::Hash::hash(&self.left, state);
        std::hash::Hash::hash(&self.right, state);
    }
}

struct Rect {
    left: i32,
    right: i32,
    top: i32,
    bottom: i32,
}

fn rectangles(level_walls: &HashSet<GridCoords>, width: i32, height: i32) -> Vec<Rect> {
    // combine wall tiles into flat "plates" in each individual row
    let mut plate_stack: Vec<Vec<Plate>> = Vec::new();

    for y in 0..height {
        let mut row_plates: Vec<Plate> = Vec::new();
        let mut plate_start = None;

        // + 1 to the width so the algorithm "terminates" plates that touch the right edge
        for x in 0..width + 1 {
            #[cfg(test)]
            CELL_PROBES.with(|count| count.set(count.get() + 1));
            match (plate_start, level_walls.contains(&GridCoords { x, y })) {
                (Some(s), false) => {
                    row_plates.push(Plate {
                        left: s,
                        right: x - 1,
                    });
                    plate_start = None;
                }
                (None, true) => plate_start = Some(x),
                _ => (),
            }
        }

        plate_stack.push(row_plates);
    }

    // combine "plates" into rectangles across multiple rows
    let mut rect_builder: HashMap<Plate, Rect> = HashMap::new();
    let mut prev_row: Vec<Plate> = Vec::new();
    let mut wall_rects: Vec<Rect> = Vec::new();

    // an extra empty row so the algorithm "finishes" the rects that touch the top edge
    plate_stack.push(Vec::new());

    for (y, current_row) in plate_stack.into_iter().enumerate() {
        let current_plates: HashSet<_> = current_row.iter().collect();
        for prev_plate in &prev_row {
            if !current_plates.contains(prev_plate) {
                // remove the finished rect so that the same plate in the future starts a new rect
                if let Some(rect) = rect_builder.remove(prev_plate) {
                    wall_rects.push(rect);
                }
            }
        }
        for plate in &current_row {
            rect_builder
                .entry(plate.clone())
                .and_modify(|e| e.top += 1)
                .or_insert(Rect {
                    bottom: y as i32,
                    top: y as i32,
                    left: plate.left,
                    right: plate.right,
                });
        }
        prev_row = current_row;
    }

    wall_rects
}

// Scanning a layer, including empty cells, must remain practical for live reload.
const MAX_WALL_CELLS: i32 = 1_000_000;

/// Admit the entire layer before any scan, offset negation or collider retirement.
/// Pixel edges must fit i32; center/extent calculations below use widened math.
fn admitted_grid(metadata: &LayerMetadata) -> bool {
    let width = metadata.c_wid;
    let height = metadata.c_hei;
    let grid = metadata.grid_size;
    if width <= 0 || height <= 0 || grid <= 0 {
        return false;
    }
    let Some(cells) = width.checked_mul(height) else {
        return false;
    };
    if cells > MAX_WALL_CELLS {
        return false;
    }
    let Some(y) = metadata.px_total_offset_y.checked_neg() else {
        return false;
    };
    width
        .checked_mul(grid)
        .and_then(|extent| metadata.px_total_offset_x.checked_add(extent))
        .is_some()
        && height
            .checked_mul(grid)
            .and_then(|extent| y.checked_add(extent))
            .is_some()
}

/// Replace generated colliders from each affected layer's complete live grid.
#[allow(clippy::type_complexity, clippy::too_many_arguments)]
fn spawn_wall_collision(
    mut commands: Commands,
    walls: Query<(&GridCoords, &ChildOf), With<Wall>>,
    changed: Query<
        (),
        (
            With<Wall>,
            Or<(Added<Wall>, Changed<GridCoords>, Changed<ChildOf>)>,
        ),
    >,
    layers: Query<(Entity, Ref<LayerMetadata>, Ref<ChildOf>)>,
    levels: Query<(), With<LevelIid>>,
    mut removed: RemovedComponents<Wall>,
    generated: Query<(Entity, &WallCollision)>,
    mut previous: Local<HashMap<Entity, LayerWalls>>,
) {
    let removed_any = removed.read().count() != 0;
    if !removed_any
        && changed.is_empty()
        && !layers
            .iter()
            .any(|(_, metadata, parent)| metadata.is_changed() || parent.is_changed())
        && previous.keys().all(|layer| layers.contains(*layer))
    {
        return;
    }
    let mut cells_by_layer: HashMap<Entity, HashSet<GridCoords>> = HashMap::new();
    for (coords, parent) in &walls {
        cells_by_layer
            .entry(parent.parent())
            .or_default()
            .insert(*coords);
    }
    for (entity, metadata, parent) in &layers {
        let cells = cells_by_layer.remove(&entity).unwrap_or_default();
        if cells.is_empty() && !previous.contains_key(&entity) {
            continue;
        }
        if !levels.contains(parent.parent())
            || !admitted_grid(&metadata)
            || cells.iter().any(|cell| {
                cell.x < 0 || cell.x >= metadata.c_wid || cell.y < 0 || cell.y >= metadata.c_hei
            })
        {
            warn!("Unsupported wall layer {entity:?}: invalid/over-budget grid, coordinates or level parent; retaining previous collisions");
            continue;
        }
        let snapshot = LayerWalls {
            level: parent.parent(),
            width: metadata.c_wid,
            height: metadata.c_hei,
            grid_size: metadata.grid_size,
            offset: IVec2::new(metadata.px_total_offset_x, -metadata.px_total_offset_y),
            cells,
        };
        if previous.get(&entity) == Some(&snapshot) {
            continue;
        }
        for (collider, source) in &generated {
            if source.0 == entity {
                commands.entity(collider).despawn();
            }
        }
        let grid = i64::from(snapshot.grid_size);
        for rect in rectangles(&snapshot.cells, snapshot.width, snapshot.height) {
            commands.spawn((
                WallCollision(entity),
                Collider::cuboid(
                    (i64::from(rect.right - rect.left + 1) * grid) as f32 / 2.,
                    (i64::from(rect.top - rect.bottom + 1) * grid) as f32 / 2.,
                ),
                RigidBody::Fixed,
                Friction::coefficient(1.0),
                Transform::from_xyz(
                    ((i64::from(rect.left) + i64::from(rect.right) + 1) * grid
                        + 2 * i64::from(snapshot.offset.x)) as f32
                        / 2.,
                    ((i64::from(rect.bottom) + i64::from(rect.top) + 1) * grid
                        + 2 * i64::from(snapshot.offset.y)) as f32
                        / 2.,
                    0.,
                ),
                GlobalTransform::default(),
                ChildOf(snapshot.level),
            ));
        }
        previous.insert(entity, snapshot);
    }
    if !cells_by_layer.is_empty() {
        warn!(
            "Unsupported wall cells without source layer metadata; retaining previous collisions"
        );
    }
    for layer in previous.keys().copied().collect::<Vec<_>>() {
        if !layers.contains(layer) {
            for (collider, source) in &generated {
                if source.0 == layer {
                    commands.entity(collider).despawn();
                }
            }
            previous.remove(&layer);
        }
    }
}

pub struct WallPlugin;
impl Plugin for WallPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, spawn_wall_collision)
            .register_ldtk_int_cell::<WallBundle>(1)
            .register_ldtk_int_cell::<WallBundle>(3);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rectangles_match_every_small_grid_without_overlap() {
        for mask in 0..(1 << 9) {
            let cells: HashSet<_> = (0..9)
                .filter(|bit| mask & (1 << bit) != 0)
                .map(|bit| GridCoords::new(bit % 3, bit / 3))
                .collect();
            let mut covered = HashSet::new();
            for rect in rectangles(&cells, 3, 3) {
                for y in rect.bottom..=rect.top {
                    for x in rect.left..=rect.right {
                        assert!(
                            covered.insert(GridCoords::new(x, y)),
                            "overlapping rectangles"
                        );
                    }
                }
            }
            assert_eq!(covered, cells);
        }
        let vertical = HashSet::from([GridCoords::new(1, 0), GridCoords::new(1, 1)]);
        let rects = rectangles(&vertical, 3, 2);
        assert_eq!(rects.len(), 1);
        assert_eq!(
            (rects[0].left, rects[0].right, rects[0].bottom, rects[0].top),
            (1, 1, 0, 1)
        );
    }

    #[test]
    fn alternating_rows_use_linear_plate_identity_work() {
        for width in [128, 4096] {
            let cells: HashSet<_> = (0..width).map(|x| GridCoords::new(x, x % 2)).collect();
            PLATE_WORK.with(|count| count.set(0));
            let rects = rectangles(&cells, width, 2);
            assert_eq!(rects.len(), width as usize);
            let work = PLATE_WORK.with(std::cell::Cell::get);
            assert!(
                work <= 32 * width as usize,
                "{work} plate identity operations for {width} plates"
            );
        }
    }

    fn setup(swapped: bool) -> (App, Entity, Entity) {
        let mut small = LayerInstance {
            iid: "small".into(),
            c_wid: 8,
            c_hei: 8,
            grid_size: 8,
            ..default()
        };
        small.px_total_offset_x = 3;
        let large = LayerInstance {
            iid: "large".into(),
            c_wid: 4,
            c_hei: 4,
            grid_size: 16,
            ..default()
        };
        let mut level = crate::testing::level();
        level.layer_instances = Some(if swapped {
            vec![large.clone(), small.clone()]
        } else {
            vec![small.clone(), large.clone()]
        });
        let (mut app, project) = crate::testing::project_app(vec![level]);
        app.add_systems(Update, spawn_wall_collision);
        app.world_mut().spawn(LdtkProjectHandle::from(project));
        let level = app
            .world_mut()
            .spawn((LevelIid::new("synthetic-level"), Transform::default()))
            .id();
        let a = app
            .world_mut()
            .spawn((LayerMetadata::from(&small), ChildOf(level)))
            .id();
        let b = app
            .world_mut()
            .spawn((LayerMetadata::from(&large), ChildOf(level)))
            .id();
        (app, a, b)
    }

    fn tile(app: &mut App, layer: Entity, x: i32) -> Entity {
        app.world_mut()
            .spawn((Wall, GridCoords::new(x, 0), ChildOf(layer)))
            .id()
    }

    fn geometry(app: &mut App) -> Vec<(i32, i32, i32, i32)> {
        let mut query = app.world_mut().query::<(&Collider, &Transform)>();
        let mut rects: Vec<_> = query
            .iter(app.world())
            .map(|(collider, transform)| {
                let half = collider.as_cuboid().unwrap().half_extents();
                let center = transform.translation.truncate();
                (
                    (center.x - half.x) as i32,
                    (center.y - half.y) as i32,
                    (center.x + half.x) as i32,
                    (center.y + half.y) as i32,
                )
            })
            .collect();
        rects.sort();
        rects
    }

    #[test]
    fn each_source_layer_keeps_its_grid_and_offset_in_any_order() {
        for swapped in [false, true] {
            let (mut app, a, b) = setup(swapped);
            tile(&mut app, a, 1);
            tile(&mut app, b, 2);
            app.update();
            assert_eq!(geometry(&mut app), vec![(11, 0, 19, 8), (32, 0, 48, 16)]);
        }
    }

    #[test]
    fn incremental_tiles_removals_and_level_respawn_replace_geometry() {
        let (mut app, a, _) = setup(false);
        app.world_mut()
            .get_mut::<LayerMetadata>(a)
            .unwrap()
            .px_total_offset_x = 0;
        let first = tile(&mut app, a, 0);
        app.update();
        assert_eq!(geometry(&mut app), vec![(0, 0, 8, 8)]);
        tile(&mut app, a, 1);
        app.update();
        assert_eq!(geometry(&mut app), vec![(0, 0, 16, 8)]);
        app.world_mut().despawn(first);
        app.update();
        assert_eq!(geometry(&mut app), vec![(8, 0, 16, 8)]);
        let level = app.world().get::<ChildOf>(a).unwrap().parent();
        app.world_mut().despawn(level);
        app.update();
        assert!(geometry(&mut app).is_empty());
        let level = app.world_mut().spawn(LevelIid::new("synthetic-level")).id();
        let layer = app
            .world_mut()
            .spawn((
                LayerMetadata::from(&LayerInstance {
                    c_wid: 8,
                    c_hei: 8,
                    grid_size: 8,
                    ..default()
                }),
                ChildOf(level),
            ))
            .id();
        tile(&mut app, layer, 2);
        app.update();
        app.update();
        assert_eq!(geometry(&mut app), vec![(16, 0, 24, 8)]);
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    #[test]
    fn grid_admission_accepts_budget_and_checked_coordinate_boundaries() {
        let metadata = |layer: LayerInstance| LayerMetadata::from(&layer);
        assert!(admitted_grid(&metadata(LayerInstance {
            c_wid: 1000,
            c_hei: 1000,
            grid_size: 1,
            ..default()
        })));
        assert!(admitted_grid(&metadata(LayerInstance {
            c_wid: 1,
            c_hei: 1,
            grid_size: i32::MAX,
            px_total_offset_x: i32::MIN,
            ..default()
        })));
        assert!(!admitted_grid(&metadata(LayerInstance {
            c_wid: 1001,
            c_hei: 1000,
            grid_size: 1,
            ..default()
        })));
    }

    #[test]
    fn excessive_work_and_coordinate_overflow_retain_last_good_colliders() {
        let mut app = App::new();
        app.add_systems(Update, spawn_wall_collision);
        let level = app.world_mut().spawn(LevelIid::new("synthetic")).id();
        let valid = LayerInstance {
            c_wid: 2,
            c_hei: 2,
            grid_size: 8,
            ..default()
        };
        let layer = app
            .world_mut()
            .spawn((LayerMetadata::from(&valid), ChildOf(level)))
            .id();
        app.world_mut()
            .spawn((Wall, GridCoords::new(0, 0), ChildOf(layer)));
        app.update();
        let original = app
            .world_mut()
            .query_filtered::<Entity, With<WallCollision>>()
            .single(app.world())
            .unwrap();
        let probes = CELL_PROBES.with(std::cell::Cell::get);
        for invalid in [
            LayerInstance {
                c_wid: i32::MAX,
                ..valid.clone()
            },
            LayerInstance {
                c_hei: i32::MAX,
                ..valid.clone()
            },
            LayerInstance {
                c_wid: 1_000_001,
                c_hei: 1,
                ..valid.clone()
            },
            LayerInstance {
                px_total_offset_y: i32::MIN,
                ..valid.clone()
            },
            LayerInstance {
                px_total_offset_x: i32::MAX - 1,
                ..valid.clone()
            },
            LayerInstance {
                grid_size: i32::MAX,
                ..valid.clone()
            },
        ] {
            app.world_mut()
                .entity_mut(layer)
                .insert(LayerMetadata::from(&invalid));
            app.update();
            assert_eq!(CELL_PROBES.with(std::cell::Cell::get), probes);
            assert_eq!(
                app.world_mut()
                    .query_filtered::<Entity, With<WallCollision>>()
                    .single(app.world())
                    .unwrap(),
                original
            );
            let transform = app.world().get::<Transform>(original).unwrap();
            assert_eq!(transform.translation, Vec3::new(4., 4., 0.));
            assert_eq!(
                app.world()
                    .get::<Collider>(original)
                    .unwrap()
                    .as_cuboid()
                    .unwrap()
                    .half_extents(),
                Vec2::splat(4.)
            );
        }
        // Rejected snapshots do not poison later valid rebuilding.
        app.world_mut()
            .entity_mut(layer)
            .insert(LayerMetadata::from(&LayerInstance {
                grid_size: 16,
                ..valid
            }));
        app.update();
        assert!(app.world().get_entity(original).is_err());
    }

    #[test]
    fn invalid_metadata_retains_geometry_and_layer_removal_retires_it() {
        let mut app = App::new();
        app.add_systems(Update, spawn_wall_collision);
        let level = app.world_mut().spawn(LevelIid::new("synthetic")).id();
        let layer = app
            .world_mut()
            .spawn((
                LayerMetadata::from(&LayerInstance {
                    c_wid: 2,
                    c_hei: 2,
                    grid_size: 8,
                    ..default()
                }),
                ChildOf(level),
            ))
            .id();
        let tile = app
            .world_mut()
            .spawn((Wall, GridCoords::new(0, 0), ChildOf(layer)))
            .id();
        app.update();
        let count = |app: &mut App| {
            app.world_mut()
                .query::<&WallCollision>()
                .iter(app.world())
                .count()
        };
        assert_eq!(count(&mut app), 1);
        app.world_mut()
            .get_mut::<LayerMetadata>(layer)
            .unwrap()
            .grid_size = 0;
        app.update();
        assert_eq!(count(&mut app), 1);
        app.world_mut()
            .get_mut::<LayerMetadata>(layer)
            .unwrap()
            .grid_size = 16;
        app.update();
        assert_eq!(count(&mut app), 1);
        app.world_mut().entity_mut(tile).remove::<Wall>();
        app.update();
        assert_eq!(count(&mut app), 0);
        app.world_mut().entity_mut(tile).insert(Wall);
        app.update();
        assert_eq!(count(&mut app), 1);
        app.world_mut().despawn(layer);
        app.update();
        assert_eq!(count(&mut app), 0);
    }
}
