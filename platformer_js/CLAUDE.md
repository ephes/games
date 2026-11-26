# Platformer JS Game

A modular 2D platformer game built with HTML5 Canvas and JavaScript ES modules.

## Current Structure

The game has been refactored from a monolithic structure into clean ES modules:

```
src/
├── main.js                 # Entry point and game initialization
├── Game.js                 # Main game loop and coordination
├── entities/
│   ├── Player.js          # Player logic and state
│   ├── Enemy.js           # Base enemy class
│   ├── Boss.js            # Boss enemy logic
│   └── Projectile.js      # Projectile logic
├── systems/
│   ├── InputManager.js    # Keyboard/input handling
│   ├── CollisionSystem.js # Collision detection
│   ├── Camera.js          # Camera/viewport management
│   └── SpriteLoader.js    # Sprite loading and management
├── objects/
│   ├── Platform.js        # Platform objects
│   ├── Coin.js            # Collectible coins
│   └── Portal.js          # Level exit portal
├── rendering/
│   └── Renderer.js        # Centralized rendering with sprite support
└── utils/
    ├── constants.js       # Game constants and configuration
    └── helpers.js         # Utility functions
```

## Development Setup

### Prerequisites

- Node.js 24 LTS (or 26+) (CI uses `platformer_js/.node-version`)
- npm or yarn

### Installation

```bash
npm ci
```

### Running the Game

```bash
# Development server with hot reload
npm run dev

# The game runs at http://localhost:5173
```

Note: Due to ES module CORS restrictions, the game must be served via HTTP. Opening `index.html` directly won't work.

## Testing

The Vitest suite imports the real Player and InputManager for animation, timer
and action delivery contracts. Renewing invulnerability restarts the hit visual
and protection counters, which advance in simulation milliseconds. Animation state
priority is hit, jump/fall, run, idle, with state changes resetting frame and timer.
Frames advance at 15 FPS with idle/run/hit counts 11/12/7 and single-frame jump/fall.
Advance fixed simulation steps to test hit and protection expiry. Fake wall
time tests verify that discarded time during suspension leaves both intact.
Action dispatch snapshots subscribers per edge; self-removal cannot skip peers.
Dispose each test input manager and restore fake timers after each case.

The Vitest suite also includes focused tests of the real CollisionSystem, Renderer,
Coin and Game collection path. Platform fixtures pin strict overlap, the 50%
support boundary, downward landing, upward ceiling contact and unchanged state
when there is no contact. Renderer tests use a recording canvas context and
synthetic sprite provider to check source cells, destinations, left-facing
transforms and save/restore balance, including boss hit compositing before health
bars and later entities. Coin tests pin one award per coin, no collected drawing,
and shooting enabled only by power-ups across repeated Game collision frames.
Platform sweeps accept a full previous x/y pose and measure support at the
vertical contact time (legacy Y-only snapshots keep fixed X). Body contacts use
earliest swept contact across enemies/boss with projectile geometry tie rules;
bounce/respawn retires previous player and target sweeps. Coins use the same
swept rectangle primitive with the pre-step player pose, skipping collected coins
and respawn teleport paths. Platform and coin candidates query the level-owned
static tree in level order; collected coins retire from collision branches.
Coins, body effects and already-open portal entry resolve by contact time;
exact ties go coins, then body, then portal, and bounce/respawn replaces unused
sweeps. Unlocked portal entry sweeps the admitted post-platform motion with the
existing center threshold only when the portal was unlocked at step start; a
mid-step unlock (player shot defeating the boss, or stomp) is endpoint-only.
A boss shot yields to swept portal entry only when entry precedes both the shot
and any body contact. An exact shot/portal tie still resolves the shot first.
Enemy draw calls use inclusive camera bounds (run and hit sprites fit their
destination rectangle), while offscreen simulation continues. Enemies retire
from the level after their 300 ms hit visual finishes. Keep these fixtures synthetic, dispose each Game and
restore timer/global mocks.

```bash
# Run tests in watch mode (for development)
npm test

# Run tests once (for CI/checking)
npm run test:run

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run coverage
```

## Code Quality

### Linting

```bash
# Check for linting issues
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

### Formatting

```bash
# Format all files with Prettier
npm run format

# Check formatting without changes
npm run format:check
```

Pre-commit hooks are configured to automatically run ESLint and Prettier on staged files.

## Building and Deployment

```bash
# Build for production
npm run build

# Build documentation
npm run build:docs

# Preview production build
npm run preview
```

GitHub Actions runs only on manual dispatch; a run checks the build, including
`npm run test:browser` after `npx playwright install --with-deps chromium`. Pages publication requires
a manual workflow run with `publish` enabled (disabled by default).

## Architecture Highlights

### Entities

- **Player**: Handles player state, movement, animations, and power-ups
- **Enemy**: Base class for enemies with patrol behavior
- **Boss**: Extended enemy with health system and special animations
- **Projectile**: Player-fired projectiles with collision detection

Enemy defeat is accepted once, before its timed hit animation finishes; Game
scores only an accepted transition. Boss damage retains its health semantics.
Game passes level bounds to Boss and its shots; resets, transitions and imports
replace the projectile owner. Programmatic boss speed zero stays stationary.

### Systems

- **InputManager**: Keyboard actions scoped to the Game canvas focus; editing,
  composition, prevented events and browser shortcuts do not become gameplay;
  a held key is still released on its keyup (modifier, prevented or composing).
  Test focus/default actions in Chromium, and dispose every manager/game.
- **CollisionSystem**: Static methods for all collision detection logic
- **Camera**: Smooth camera following with boundary constraints
- **SpriteLoader**: Async sprite loading with caching

### Game Flow

1. `main.js` owns one Game from DOM readiness through page retirement
2. `Game.js` coordinates all systems and game objects
3. One owned RAF loop runs bounded fixed 60 Hz simulation steps and renders once per frame
4. Renderer handles all drawing operations with sprite animations

On every `pagehide`, the entry point releases its current Game slot before
attempting disposal, including during pending initialization. A persisted
`pageshow` starts a fresh game (level zero, initial score/lives). Ordinary
hidden-tab input reset keeps the Game. Duplicate restore events do not retry failed initialization;
another hide/restore cycle can retry with a new instance. `disposePage()` removes
entry-point listeners and retires the Game, and Vite HMR calls it before replacement.
Both retirement paths report disposal failures to the console and return normally.
Old initialization completion/rejection cannot affect the replacement owner.
`pageLifetime.test.js` and the Chromium smoke cover synthetic retirement,
restoration, pending initialization, failed re-entry and replacement sequences.

`start()` is idempotent and ignores calls until initialization succeeds. Call
`await game.init()` then `game.start()`; an early call leaves the instance usable
and does not queue an automatic start. `dispose()` is terminal and releases input. Initialization
failure disposes the partial game while retaining the original error. Deferred
initialization and imports cannot publish after disposal. Replacement and append
LDtk requests publish only the latest requested candidate; conversion never reads
another in-flight request's world. Preflight and direct level conversion reject
duplicate Platforms/Entities layer identifiers, while unrelated layers remain
allowed; failed import retains the old playable world. Replacement/append share
a 20,000-platform
world budget; append checks the complete retained table. Successful terminal
reset/replacement restores initial lives and clears terminal flags only after
construction succeeds, preserving score and shooting/cooldown state. Suspension gaps over 250 ms reset simulation
timing, with at most five catch-up steps otherwise. Player and boss shot cooldowns use `performance.now()` independently of wall-clock
changes. Player cooldowns survive level reloads; the first shot is immediately
available. Portal pulse phase advances at 3 radians per second in `Game.update`,
wraps at 2π, and stays unchanged by drawing or discarded suspension time.
Terminal game states freeze it; a new level starts at zero. Enemy animation and 300 ms defeated visuals use accumulated simulation
elapsed time; hit resets the frame clock. Boss animation keeps a simulation-time
frame remainder (200 ms per sequence step)
and a monotonic accumulated clock shared by hit expiry and renderer fading.
Accepted damage renews the 400 ms hit visual without resetting animation.
Boss overrides `isInHitAnimation()` to false: a defeated boss is not drawn.
Player hit visuals and protection count down in simulation milliseconds (500 ms and the requested duration),
both restarted on renewal and retired by `dispose()`; pause, hidden tabs and
wall-clock changes leave them unchanged. Authored LDtk dimensions are validated and retained;
Game derives complete object extents and shares bounds with its player, camera
and boss shots, including vertical camera following in tall levels.

## Recent Improvements

### Bug Fixes

- Fixed double jump bug - players can no longer jump while in air
- Fixed platform edge detection - requires 50% overlap to be grounded
- Fixed async initialization issues causing blank screen

### Features Added

- Modular ES6 architecture
- Comprehensive test coverage
- JSDoc documentation
- Build tooling with Vite
- Pre-commit hooks
- GitHub Actions deployment

## Configuration

Game configuration is centralized in `src/utils/constants.js`:

- Game settings (lives, shot cooldown)
- Player configuration (start position, speed)
- Level data (platforms, enemies, coins)

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.

Current version: 0.1.0 (Alpha)
