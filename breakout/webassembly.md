## Add WASM support 

```shell
rustup target install wasm32-unknown-unknown
```

Install server runner
```shell
cargo install wasm-server-runner
```

## Configure your project to use wasm server runner

Set up cargo to use it, in .cargo/config.toml (in your project folder, or globally in your user home folder):


[target.wasm32-unknown-unknown]
runner = "wasm-server-runner"

## Run breakout

```shell
cargo run --target wasm32-unknown-unknown
```
## Build for website

Install wasm-bindgen

```shell
cargo install wasm-bindgen-cli
```
Build Javascript:
```shell
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --no-typescript --target web \
    --out-dir ./html/ \
    --out-name "breakout" \
    ./target/wasm32-unknown-unknown/release/breakout.wasm
```
## Run a webserver

```shell
cd html
python -m http.server 8000
```

Then go to http://localhost:8000/
