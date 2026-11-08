use bevy::asset::{
    io::{
        memory::{Dir, MemoryAssetReader},
        AssetSourceBuilder,
    },
    AssetPlugin,
};
use bevy::prelude::*;
use bevy_ecs_ldtk::{
    ldtk::{LdtkJson, Level},
    prelude::*,
};
use std::{
    path::Path,
    time::{Duration, Instant},
};

pub fn project_app(levels: Vec<Level>) -> (App, Handle<LdtkProject>) {
    let project = LdtkJson {
        levels,
        ..default()
    };
    let dir = Dir::default();
    dir.insert_asset_text(
        Path::new("synthetic.ldtk"),
        &serde_json::to_string(&project).unwrap(),
    );
    let mut app = App::new();
    app.register_asset_source(
        bevy::asset::io::AssetSourceId::Default,
        AssetSourceBuilder::new(move || Box::new(MemoryAssetReader { root: dir.clone() })),
    )
    .add_plugins((MinimalPlugins, AssetPlugin::default(), TransformPlugin))
    .init_asset::<Image>()
    .init_asset::<TextureAtlasLayout>()
    .add_plugins(bevy_ecs_ldtk::assets::LdtkAssetPlugin);
    let handle = app.world().resource::<AssetServer>().load("synthetic.ldtk");
    let deadline = Instant::now() + Duration::from_secs(10);
    while !app
        .world()
        .resource::<Assets<LdtkProject>>()
        .contains(&handle)
    {
        assert!(
            Instant::now() < deadline,
            "synthetic project failed to load"
        );
        app.update();
        std::thread::yield_now();
    }
    (app, handle)
}

pub fn level() -> Level {
    Level {
        iid: "synthetic-level".into(),
        uid: 1,
        px_wid: 128,
        px_hei: 128,
        layer_instances: Some(vec![]),
        ..default()
    }
}
