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

The project uses Vitest for unit testing covering game logic. Collision tests call
the production system with synthetic rectangles: touching edges do not overlap,
landing needs at least 50% horizontal support while falling, and an upward
ceiling hit stops vertical speed without clearing jumping state. Renderer tests
record sprite source/destination geometry, facing transforms and canvas state
restoration without pixel snapshots. Coin tests verify one award, hidden
collected geometry and real Game scoring/power-up behavior across repeated
collision frames. All fixtures are synthetic and need no network assets. Loader tests run
real LDtk world/level conversion, entity field lookup and IntGrid collision mesh
merging against synthetic records, mocking only `World.fromURL`. Sprite loader
tests use explicitly triggered Image load/error events to check cache identity,
out-of-order completion and failed startup without network requests or timers.

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

Switching windows or hiding the tab clears held movement and shooting keys.
Press again after returning. Call `game.dispose()` before replacing a game to
cancel its animation and remove input listeners; standalone input managers have
`dispose()` too. Starting twice keeps one animation chain. Disposal is terminal:
create a fresh Game to restart. Failed initialization disposes input and preserves
the startup error; disposal during sprite loading prevents later activation.

Simulation uses fixed 60 Hz steps and renders once per animation frame. A frame
can run at most five simulation steps; gaps over 250 ms discard accumulated time
so returning from suspension does not replay missed movement. Shooting cooldowns,
invulnerability and hit animations continue to use wall-clock time.

Camera and player horizontal bounds refresh on level creation, transitions,
resets, and LDtk replacement. The right edge is the farthest platform's
`x + width`, with at least one viewport of width; vertical bounds stay fixed to
the canvas height.

Damage respawns the player at the active level's start, clearing vertical speed
and jumping state while retaining the usual life loss and invulnerability.
Enemies accept one defeat and award 50 points once, even when bullets and a
stomp overlap. Defeated enemies stop moving/colliding immediately while their
300 ms hit animation remains visible. Boss health and per-hit scoring are unchanged.
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
imports completed after disposal do not publish.

LDtk Platforms layers require positive safe integer grid size, width and height,
with safe integer pixel extents and at most 1,000,000 cells per layer.
`intGridCsv` must be an array containing exactly `width * height` cells, including
zero cells for empty space; value 1 creates collision geometry. A level may omit
the Platforms layer entirely when no enemy or boss needs a patrol surface.
Recognized entities require finite numeric x/y coordinates. Enemy `Speed` must
be a finite number (zero stays stationary); enemy and boss `PlatformIndex` must
be an integer in the final merged platform array. Missing fields default to speed
2 and platform index 0; present strings, nulls or nonfinite values are rejected.
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
