use bevy::{app::MainScheduleOrder, ecs::schedule::*, prelude::*};

/// Independent [`Schedule`] for stepping systems.
///
/// The stepping systems must run in their own schedule to be able to inspect
/// all the other schedules in the [`App`].  This is because the currently
/// executing schedule is removed from the [`Schedules`] resource while it is
/// being run.
#[derive(Debug, Hash, PartialEq, Eq, Clone, ScheduleLabel)]
struct DebugSchedule;

/// Plugin to add a stepping UI to an example
#[derive(Default)]
pub struct SteppingPlugin {
    schedule_labels: Vec<InternedScheduleLabel>,
    top: Val,
    left: Val,
}

impl SteppingPlugin {
    /// add a schedule to be stepped when stepping is enabled
    pub fn add_schedule(mut self, label: impl ScheduleLabel) -> SteppingPlugin {
        self.schedule_labels.push(label.intern());
        self
    }

    /// Set the location of the stepping UI when activated
    pub fn at(self, left: Val, top: Val) -> SteppingPlugin {
        SteppingPlugin { top, left, ..self }
    }
}

impl Plugin for SteppingPlugin {
    fn build(&self, app: &mut App) {
        // create and insert our debug schedule into the main schedule order.
        // We need an independent schedule so we have access to all other
        // schedules through the `Stepping` resource
        app.init_schedule(DebugSchedule);
        let mut order = app.world.resource_mut::<MainScheduleOrder>();
        order.insert_after(Update, DebugSchedule);

        // create our stepping resource
        let mut stepping = Stepping::new();
        for label in &self.schedule_labels {
            stepping.add_schedule(*label);
        }
        app.insert_resource(stepping);

        // add our startup & stepping systems
        app.insert_resource(State {
            ui_top: self.top,
            ui_left: self.left,
            systems: Vec::new(),
            initialized: false,
        })
        .add_systems(Startup, build_help)
        .add_systems(
            DebugSchedule,
            (
                build_ui.run_if(not(initialized)),
                handle_input,
                update_ui.run_if(initialized),
            )
                .chain(),
        );
    }
}

/// Struct for maintaining stepping state
#[derive(Resource, Debug)]
struct State {
    initialized: bool,
    // vector of schedule/nodeid -> text index offset
    systems: Vec<(InternedScheduleLabel, NodeId, usize)>,

    // ui positioning
    ui_top: Val,
    ui_left: Val,
}

/// condition to check if the stepping UI has been constructed
fn initialized(state: Res<State>) -> bool {
    state.initialized
}

const FONT_SIZE: f32 = 20.0;
const FONT_COLOR: Color = Color::rgb(0.2, 0.2, 0.2);
const FONT_BOLD: &str = "fonts/FiraSans-Bold.ttf";
const FONT_MEDIUM: &str = "fonts/FiraMono-Medium.ttf";

#[derive(Component)]
struct SteppingUi;

/// Construct the stepping UI elements from the [`Schedules`] resource.
///
/// This system may run multiple times before constructing the UI as all of the
/// data may not be available on the first run of the system.  This happens if
/// one of the stepping schedules has not yet been run.
fn build_ui(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    schedules: Res<Schedules>,
    mut stepping: ResMut<Stepping>,
    mut state: ResMut<State>,
) {
    let mut text_sections = Vec::new();
    let mut always_run = Vec::new();
    let mut system_mappings = Vec::new();

    let Ok(schedule_order) = stepping.schedules() else {
        return;
    };

    // go through the stepping schedules and construct a list of systems for
    // each label
    for label in schedule_order {
        let Some(schedule) = schedules.get(*label) else {
            return;
        };
        text_sections.push(TextSection::new(
            format!("{:?}\n", label),
            TextStyle {
                font: asset_server.load(FONT_BOLD),
                font_size: FONT_SIZE,
                color: FONT_COLOR,
            },
        ));

        // grab the list of systems in the schedule, in the order the
        // single-threaded executor would run them.
        let Ok(systems) = schedule.systems() else {
            return;
        };

        for (node_id, system) in systems {
            // skip bevy default systems; we don't want to step those
            if system.name().starts_with("bevy") {
                always_run.push((*label, node_id));
                continue;
            }

            // Add an entry to our systems list so we can find where to draw
            // the cursor when the stepping cursor is at this system
            system_mappings.push((*label, node_id, text_sections.len()));

            // Add a text section for displaying the cursor for this system
            text_sections.push(TextSection::new(
                "   ",
                TextStyle {
                    font: asset_server.load(FONT_MEDIUM),
                    font_size: FONT_SIZE,
                    color: FONT_COLOR,
                },
            ));

            // add the name of the system to the ui
            text_sections.push(TextSection::new(
                format!("{}\n", system.name()),
                TextStyle {
                    font: asset_server.load(FONT_MEDIUM),
                    font_size: FONT_SIZE,
                    color: FONT_COLOR,
                },
            ));
        }
    }

    for (label, node) in always_run.drain(..) {
        stepping.always_run_node(label, node);
    }

    commands.spawn((
        SteppingUi,
        TextBundle {
            text: Text::from_sections(text_sections),
            style: Style {
                position_type: PositionType::Absolute,
                top: state.ui_top,
                left: state.ui_left,
                padding: UiRect::all(Val::Px(10.0)),
                ..default()
            },
            background_color: BackgroundColor(Color::rgba(1.0, 1.0, 1.0, 0.33)),
            visibility: Visibility::Hidden,
            ..default()
        },
    ));
    state.systems = system_mappings;
    state.initialized = true;
}

fn build_help(mut commands: Commands, asset_server: Res<AssetServer>) {
    // stepping description box
    commands.spawn((TextBundle::from_sections([TextSection::new(
        "Press ` to toggle stepping mode (S: step system, Space: step frame)",
        TextStyle {
            font: asset_server.load(FONT_MEDIUM),
            font_size: 18.0,
            color: FONT_COLOR,
        },
    )])
    .with_style(Style {
        position_type: PositionType::Absolute,
        bottom: Val::Px(5.0),
        left: Val::Px(5.0),
        ..default()
    }),));
}

fn handle_input(keyboard_input: Res<ButtonInput<KeyCode>>, mut stepping: ResMut<Stepping>) {
    if keyboard_input.just_pressed(KeyCode::Slash) {
        info!("{:#?}", stepping);
    }
    // grave key to toggle stepping mode for the FixedUpdate schedule
    if keyboard_input.just_pressed(KeyCode::Backquote) {
        if stepping.is_enabled() {
            stepping.disable();
            debug!("disabled stepping");
        } else {
            stepping.enable();
            debug!("enabled stepping");
        }
    }

    if !stepping.is_enabled() {
        return;
    }

    // space key will step the remainder of this frame
    if keyboard_input.just_pressed(KeyCode::Space) {
        debug!("continue");
        stepping.continue_frame();
    } else if keyboard_input.just_pressed(KeyCode::KeyS) {
        debug!("stepping frame");
        stepping.step_frame();
    }
}

fn update_ui(
    mut commands: Commands,
    state: Res<State>,
    stepping: Res<Stepping>,
    mut ui: Query<(Entity, &mut Text, &Visibility), With<SteppingUi>>,
) {
    if ui.is_empty() {
        return;
    }

    // ensure the UI is only visible when stepping is enabled
    let (ui, mut text, vis) = ui.single_mut();
    match (vis, stepping.is_enabled()) {
        (Visibility::Hidden, true) => {
            commands.entity(ui).insert(Visibility::Inherited);
        }
        (Visibility::Hidden, false) | (_, true) => (),
        (_, false) => {
            commands.entity(ui).insert(Visibility::Hidden);
        }
    }

    // if we're not stepping, there's nothing more to be done here.
    if !stepping.is_enabled() {
        return;
    }

    let (cursor_schedule, cursor_system) = match stepping.cursor() {
        // no cursor means stepping isn't enabled, so we're done here
        None => return,
        Some(c) => c,
    };

    for (schedule, system, text_index) in &state.systems {
        let mark = if &cursor_schedule == schedule && *system == cursor_system {
            "-> "
        } else {
            "   "
        };
        text.sections[*text_index].value = mark.to_string();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bevy::{
        asset::{
            io::{memory::MemoryAssetReader, AssetSource, AssetSourceId},
            AssetApp,
        },
        ecs::system::RunSystemOnce,
    };

    #[derive(Debug, Hash, PartialEq, Eq, Clone, ScheduleLabel)]
    struct FirstSchedule;
    #[derive(Debug, Hash, PartialEq, Eq, Clone, ScheduleLabel)]
    struct SecondSchedule;

    // Shares the production readiness guard and runs just before the updater.
    fn assert_ui_ready(ui: Query<(), With<SteppingUi>>) {
        assert_eq!(ui.iter().count(), 1);
    }

    fn first_system() {}
    fn second_system() {}

    fn headless_app(plugin: SteppingPlugin) -> App {
        let mut app = App::new();
        let reader = MemoryAssetReader::default();
        app.add_plugins(MinimalPlugins)
            .register_asset_source(
                AssetSourceId::Default,
                AssetSource::build().with_reader(move || Box::new(reader.clone())),
            )
            .add_plugins(AssetPlugin::default())
            .init_asset::<Font>()
            .init_resource::<ButtonInput<KeyCode>>()
            .add_plugins(plugin)
            .add_systems(
                DebugSchedule,
                assert_ui_ready
                    .run_if(initialized)
                    .after(build_ui)
                    .before(update_ui),
            );
        app
    }

    fn ui_count(app: &mut App) -> usize {
        app.world
            .query_filtered::<Entity, With<SteppingUi>>()
            .iter(&app.world)
            .count()
    }

    #[test]
    fn incomplete_schedule_attempts_publish_nothing_and_retry_once() {
        let mut app = headless_app(
            SteppingPlugin::default()
                .add_schedule(FirstSchedule)
                .add_schedule(SecondSchedule),
        );
        app.add_systems(FirstSchedule, first_system)
            .add_systems(SecondSchedule, second_system);
        app.world.resource_mut::<Stepping>().enable();
        app.world.run_system_once(Stepping::begin_frame);
        // Establish the selected schedule order through Bevy's public API.
        app.world.run_schedule(FirstSchedule);
        app.world.run_schedule(SecondSchedule);
        assert_eq!(
            app.world.resource::<Stepping>().schedules().unwrap(),
            &vec![FirstSchedule.intern(), SecondSchedule.intern()]
        );
        // Replace the later schedule with a not-yet-initialized instance.
        let mut later = Schedule::new(SecondSchedule);
        later.add_systems(second_system);
        app.world.resource_mut::<Schedules>().insert(later);

        for _ in 0..2 {
            app.world.run_schedule(DebugSchedule);
            assert!(app.world.resource::<State>().systems.is_empty());
            assert!(!app.world.run_system_once(initialized));
            assert_eq!(ui_count(&mut app), 0);
        }

        app.world.run_schedule(SecondSchedule);
        app.world.run_schedule(DebugSchedule);
        assert!(app.world.run_system_once(initialized));
        assert_eq!(ui_count(&mut app), 1);
        let mappings = &app.world.resource::<State>().systems;
        assert_eq!(mappings.len(), 2);
        assert_eq!(mappings[0].0, FirstSchedule.intern());
        assert_eq!(mappings[1].0, SecondSchedule.intern());
        let mut texts = app.world.query_filtered::<&Text, With<SteppingUi>>();
        let text = texts.single(&app.world);
        assert!(text
            .sections
            .iter()
            .any(|s| s.value.contains("first_system")));
        assert!(text
            .sections
            .iter()
            .any(|s| s.value.contains("second_system")));
        for (_, _, index) in &app.world.resource::<State>().systems {
            assert!(*index < text.sections.len());
        }
        app.world.run_schedule(DebugSchedule);
        assert_eq!(ui_count(&mut app), 1);
        assert_eq!(app.world.resource::<State>().systems.len(), 2);
    }

    #[test]
    fn empty_selection_creates_only_one_ui() {
        let mut app = headless_app(SteppingPlugin::default());
        for _ in 0..2 {
            app.world.run_schedule(DebugSchedule);
            assert!(app.world.run_system_once(initialized));
            assert_eq!(ui_count(&mut app), 1);
            assert!(app.world.resource::<State>().systems.is_empty());
        }
    }
}
