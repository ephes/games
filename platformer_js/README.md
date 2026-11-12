# Platformer JS

A modular 2D platformer game built with HTML5 Canvas and JavaScript ES modules. Works directly in the browser without any build step!

🎮 **[Play the game online!](https://ephes.github.io/games/platformer/)**

## 🎮 Game Features

- Side-scrolling platformer with multiple levels
- Player character with run, jump, and shoot abilities
- Enemy AI with platform patrol behavior
- Boss fight with health system and fireball attacks
- Collectible coins and power-ups
- Win condition with portal exit
- Sprite-based animations

## 🚀 Getting Started

### Prerequisites

- Node.js 24 LTS (or 26+) (CI uses `platformer_js/.node-version`)
- npm or yarn

### Installation

```bash
# Install dependencies
npm ci
```

### Running the Game

#### Development Server (Recommended)

```bash
# Start development server with hot reload
npm run dev

# Justfile shortcut
just start
```

#### Alternative: Simple HTTP Server

Due to browser security restrictions with ES modules, you need to serve the files via HTTP:

```bash
# Using Node.js
npx serve

# Using Python
python -m http.server 8000
```

Note: Opening `index.html` directly in the browser won't work due to CORS restrictions with ES modules.

#### Production Build

```bash
# Build for production (creates optimized bundle in dist/)
npm run build

# Preview production build
npm run preview
```

## 🧪 Testing

The project uses Vitest for unit testing covering game logic. Loader tests run
real LDtk world/level conversion, entity field lookup and IntGrid collision mesh
merging against synthetic records, mocking only streamed `fetch` responses. Sprite loader
tests use explicitly triggered Image load/error events to check cache identity,
out-of-order completion and failed startup without network requests or timers.
Direct Enemy tests control `Date.now()`: running frames 0–9 advance only after
more than 1/15 second; a hit resets to frame 0 and cycles frames 0–4 after
more than 50 ms per frame during the 300 ms hit window. These are wall-clock
thresholds, independent of the simulation delta.
Player Projectile tests cover a fixed 10 px step in either direction and
inclusive viewport margins: x at `cameraX - 100` or
`cameraX + screenWidth + 100` remains in bounds; only points beyond retire.
These player-shot limits differ from boss shots' world bounds. Drawing subtracts
cameraX once without moving world coordinates. Camera tests use translated
bounds and a recording canvas to check follow/clamp, touching-edge visibility,
coordinate conversion, transforms and reset, without changing camera policy.
Game rendering integration tests record boss-shot fallback arcs and sprite frame
coordinates under the parent camera transform: each path translates world space
once, leaves shot coordinates unchanged and balances context save/restore.
Inactive boss shots draw nothing.

```bash
# Run tests in watch mode
npm test

# Justfile shortcut
just test

# Run tests once (CI mode)
npm run test:run

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run coverage
```

## 🔧 Development

### Code Quality

The project uses ESLint and Prettier for code quality and formatting.

```bash
# Check for linting issues
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format all files with Prettier
npm run format

# Check formatting without making changes
npm run format:check
```

The local CI-equivalent sequence, from `platformer_js/`, is:

```bash
npm ci
npm run lint
npm run format:check
npm run test:run
npx playwright install --with-deps chromium
npm run test:browser
npm run build
npm run build:docs
npm audit --json
```

This JavaScript project has no separate type-check command. The existing lint
baseline has three `no-console` warnings; formatting has no baseline drift.
The refreshed lockfile audits with zero known vulnerabilities. Vite and the
Vitest UI are development tools: keep their default loopback binding and never
expose them to untrusted networks (`--host 0.0.0.0`) or reverse proxies.

### Pre-commit Hooks

The project uses Husky and lint-staged for automated checks:

- **Pre-commit**: Runs ESLint and Prettier on staged files
- **Pre-push**: Runs all tests to ensure code quality

## 📁 Project Structure

```
platformer_js/
├── src/              # Modular ES6 source code
│   ├── main.js       # Entry point
│   ├── Game.js       # Main game coordinator
│   ├── entities/     # Player, Enemy, Boss, Projectile, BossProjectile
│   ├── systems/      # Input, Collision, Camera, Sprites
│   ├── objects/      # Platform, Coin, Portal
│   ├── rendering/    # Renderer
│   └── utils/        # Constants and helpers
├── assets/           # Game assets
│   └── sprites/      # All sprite images
├── tests/            # Test files
├── docs/             # Documentation
│   ├── index.html    # Documentation homepage
│   └── api/          # Generated API docs
├── dist/             # Production build (for GitHub Pages)
├── legacy/           # Original monolithic code
├── index.html        # Game HTML page
├── styles.css        # Game styles
└── package.json      # Project dependencies
```

## 🎯 Game Controls

- **Arrow Keys**: Move left/right and jump
- **Space**: Shoot (after collecting power-up)

Shooting requires successful initialization and a playable game. Both direct
`game.shoot()` calls and input actions ignore win, death, disposal and pending or
failed initialization without allocating projectiles or consuming cooldown.
Live level resets/replacements preserve power-up and cooldown behavior.

Switching windows or hiding the tab clears held movement and shooting keys.
Press again after returning. Call `game.dispose()` before replacing a game to
cancel its animation and remove input listeners; standalone input managers have
`dispose()` too. Starting twice keeps one animation chain. Disposal is terminal:
create a fresh Game to restart. Concurrent and later `init()` calls share one initialization and register controls
once. Failed initialization disposes input; every later `init()` call rejects
with the same startup error. Create a fresh Game to retry. Disposal during sprite
loading prevents later activation. Update/render failures also dispose the game
and rethrow the original error: synchronous startup errors reach the caller of
`start()`, and scheduled-frame errors reach the browser error surface.

Simulation uses fixed 60 Hz steps and renders once per animation frame. A frame
can run at most five simulation steps; gaps over 250 ms discard accumulated time
so returning from suspension does not replay missed movement. Shooting cooldowns,
invulnerability and hit animations continue to use wall-clock time.

Camera and player horizontal bounds refresh on level creation, transitions,
resets, and LDtk replacement. The right edge is the farthest platform's
`x + width`, with at least one viewport of width; vertical bounds stay fixed to
the canvas height. Bounds are reduced over platforms without spreading them into
a function call, including large valid imported collision meshes.

Damage respawns the player at the active level's start, clearing vertical speed
and jumping state while retaining the usual life loss and invulnerability.
Enemies accept one defeat and award 50 points once, even when bullets and a
stomp overlap. Defeated enemies stop moving/colliding immediately while their
300 ms hit animation remains visible. Boss damage awards 20 points per nonfatal
hit and 200 once on defeat. Health stops at zero; subsequent `hit()` or
`takeDamage()` calls return zero without changing hit state or repeating projectile
cleanup.
Programmatic enemy and boss configurations preserve speed zero as stationary;
omitted speed defaults to 2. Boss shots use the active level's camera bounds,
with a 200 px horizontal and 100 px vertical off-world margin. Recreating a level
replaces its boss and projectile collection.

Bosses expose `kind: 'boss'` for collision rules, so production minification
preserves the central 40% head zone and top 20% stomp restriction.

`await game.loadLDtkLevels(url)` returns `true` when replacement succeeds or
`false` on an empty world, load/conversion error, or object construction failure.
It retains the current level index if available, otherwise starts at index zero.
Replacement objects are constructed before publishing the new levels; failure
keeps the previous level table, objects, camera and loaded world intact. Success
clears player projectiles and resets the camera, preserving score, lives and
shooting ability. Replacement and append imports share latest-request ownership:
only the most recently requested import can publish its candidate world and
levels. Superseded replacements return false, even if the newer request fails;
imports completed after disposal do not publish. Supersession and disposal abort
pending transfers. Each transfer has a 10-second total deadline and a 16 MiB
streamed response limit (actual bytes, even without an accurate Content-Length).
The loader uses the public `JSON.parse` API and raw LDtk records, including modern
`intGridCsv`, rather than the dependency's legacy wrapper objects.

Before conversion, each imported world is limited to 64 levels, 2,000,000 total
IntGrid cells and 20,000 total entities across all layers. A level may contain at
most 1,024 source entities and 4,096 horizontal collision runs/platforms, bounding
active collision/render scans. These limits include unknown entities/layers in
source totals. Append also caps the combined table at 64 levels and 20,000
recognized entities. Over-budget imports report the exceeded budget and retain
the current playable world.

Replacement and append imports validate every candidate level, including future
levels, before publishing. Each level requires one Boss and one Portal; Player
may be omitted to use the default start at (50, 200). Duplicate Player, Boss or
Portal entities are rejected. Recognized fields (`LevelName`, enemy `Speed`,
enemy/boss `PlatformIndex`, coin `IsPowerUp`) must occur at most once on their
owning level/entity. `IsPowerUp` must be a boolean when present and defaults to
false when absent. A failed next-level construction leaves the current index,
objects, projectiles and camera intact and rethrows the error. Direct
`loadNextLevel()` callers may retry; during normal play the game loop disposes the
game on that error, so a live game does not recover by itself.

LDtk Platforms layers require positive safe integer grid size, width and height,
with safe integer pixel extents and at most 1,000,000 cells per layer.
`intGridCsv` must be an array containing exactly `width * height` cells, including
zero cells for empty space; value 1 creates collision geometry. A level may omit
the Platforms layer entirely when no enemy or boss needs a patrol surface.
Recognized entities require finite numeric x/y coordinates. Enemy `Speed` must
be a finite number (zero stays stationary); enemy and boss `PlatformIndex` must
be an integer in the final merged platform array. Missing fields default to speed
2 and platform index 0; present strings, nulls or nonfinite values are rejected.
The referenced merged patrol platform must be at least 44 px wide for an enemy
or 64 px for a boss, including stationary enemies. Exact-width surfaces are
valid; narrower surfaces fail conversion with an authoring error naming the
entity and minimum width before the candidate world is accepted.
Conversion throws on invalid data, and `game.loadLDtkLevels(url)` returns `false`
while retaining the previous playable state, including the loaded world.

Lethal enemy, boss or boss-projectile contact ends that update immediately;
the player cannot enter a portal or win on the death frame. Coins are checked
before enemy/boss contact, while boss projectiles are checked before player
projectiles and other collisions. Surviving contact still permits portal entry.

## 🚀 GitHub Pages Deployment

Pull requests and pushes to `main` or `fix/**` run read-only quality checks,
including a synthetic Chromium clock smoke at 30, 60 and 144 Hz. Publishing is
manual: run **Platformer quality and manual publication** with `publish` enabled.
It defaults to false; ordinary pushes and PRs never upload or deploy Pages.

The game will be available at: `https://[username].github.io/[repo-name]/`

## 📚 Documentation

- **Game Documentation**: Available at `/docs/` when deployed
- **API Documentation**: Generated with JSDoc at `/docs/api/`
- **Development Guide**: See [CLAUDE.md](./CLAUDE.md)

## 🔧 Architecture

The game has been refactored from a monolithic structure into clean ES modules:

- **Entities**: Player, Enemy, Boss, and Projectile classes
- **Systems**: InputManager, CollisionSystem, Camera, and SpriteLoader
- **Objects**: Platform, Coin, and Portal classes
- **Rendering**: Centralized rendering with sprite animation support
- **Game**: Main coordinator that ties everything together

Each module has a single responsibility and can be tested independently.

## 📝 License

This project is open source and available under the MIT License.
