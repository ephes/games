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

- Node.js (v14 or higher)
- npm or yarn

### Installation

```bash
npm install
```

### Running the Game

```bash
# Development server with hot reload
npm run dev

# The game runs at http://localhost:5173
```

Note: Due to ES module CORS restrictions, the game must be served via HTTP. Opening `index.html` directly won't work.

## Testing

The project includes a comprehensive test suite with 56+ tests using Vitest:

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

The project includes GitHub Actions for automated deployment to GitHub Pages.

## Architecture Highlights

### Entities

- **Player**: Handles player state, movement, animations, and power-ups
- **Enemy**: Base class for enemies with patrol behavior
- **Boss**: Extended enemy with health system and special animations
- **Projectile**: Player-fired projectiles with collision detection

### Systems

- **InputManager**: Centralized keyboard input handling with event system
- **CollisionSystem**: Static methods for all collision detection logic
- **Camera**: Smooth camera following with boundary constraints
- **SpriteLoader**: Async sprite loading with caching

### Game Flow

1. `main.js` initializes the game when DOM is ready
2. `Game.js` coordinates all systems and game objects
3. Game loop updates entities, checks collisions, and renders
4. Renderer handles all drawing operations with sprite animations

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
