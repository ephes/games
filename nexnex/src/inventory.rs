use bevy::input::ButtonInput;
use bevy::prelude::*;
use bevy_ecs_ldtk::prelude::*;

use crate::player::Player;

#[derive(Clone, Component, Debug, Eq, Default, PartialEq)]
pub struct Inventory(Vec<String>);

impl From<&EntityInstance> for Inventory {
    fn from(entity_instance: &EntityInstance) -> Self {
        match entity_instance.iter_enums_field("items") {
            Ok(items) => Inventory(items.cloned().collect()),
            Err(error) => {
                warn!(
                    "Invalid items field on entity {}: {error}; using empty inventory",
                    entity_instance.iid
                );
                Inventory::default()
            }
        }
    }
}

/// Prints the contents of the player's inventory.
pub fn dbg_print_inventory(
    input: Res<ButtonInput<KeyCode>>,
    mut query: Query<(&Inventory, &EntityInstance), With<Player>>,
) {
    for (items, entity_instance) in &mut query {
        if input.just_pressed(KeyCode::KeyP) {
            dbg!(&items);
            dbg!(&entity_instance);
        }
    }
}
