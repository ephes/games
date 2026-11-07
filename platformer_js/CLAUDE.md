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
and action delivery contracts. Renewing invulnerability cancels the previous hit
and protection timeouts; each new call owns both expirations. Animation state
priority is hit, jump/fall, run, idle, with state changes resetting frame and timer.
Frames advance at 15 FPS with idle/run/hit counts 11/12/7 and single-frame jump/fall.
Use fake wall time for hit/protection tests independently of fixed simulation steps.
Action dispatch snapshots subscribers per edge; self-removal cannot skip peers.
Dispose each test input manager and restore fake timers after each case.

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

GitHub Actions checks pull requests, main and fix/\*\* pushes, including
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

- **InputManager**: Centralized keyboard input handling with event system
- **CollisionSystem**: Static methods for all collision detection logic
- **Camera**: Smooth camera following with boundary constraints
- **SpriteLoader**: Async sprite loading with caching

### Game Flow

1. `main.js` initializes the game when DOM is ready
2. `Game.js` coordinates all systems and game objects
3. One owned RAF loop runs bounded fixed 60 Hz simulation steps and renders once per frame
4. Renderer handles all drawing operations with sprite animations

`start()` is idempotent; `dispose()` is terminal and releases input. Initialization
failure disposes the partial game while retaining the original error. Deferred
initialization and imports cannot publish after disposal. Replacement and append
LDtk requests publish only the latest requested candidate; conversion never reads
another in-flight request's world. Suspension gaps over 250 ms reset simulation
timing, with at most five catch-up steps otherwise. Cooldowns and timed visual
effects retain wall-clock semantics.

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
