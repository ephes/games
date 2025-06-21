# Platformer JS Game

This is a 2D platformer game built with HTML5 Canvas and JavaScript.

## Current Structure

The game is currently implemented as a single monolithic class (`PlatformerGame`) in `game.js` with all game logic, rendering, and state management in one file (~900 lines).

## Recommended Improvements

### 1. Code Structure - ES Modules

The code should be refactored using ES modules for better organization and maintainability:

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
│   ├── Renderer.js        # Main rendering coordination
│   └── SpriteRenderer.js  # Sprite animation rendering
└── utils/
    └── constants.js       # Game constants and configuration
```

### 2. Testing Setup with Vitest

Add a test infrastructure using Vitest for unit and integration testing:

```json
{
  "name": "platformer-js",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "jsdom": "^23.0.0",
    "@testing-library/dom": "^9.0.0"
  }
}
```

### 3. Key Areas to Test

1. **Entity Movement**: Player/enemy position updates, velocity calculations
2. **Collision Detection**: Platform collisions, enemy collisions, projectile hits
3. **Game State**: Score tracking, lives management, power-up effects
4. **Input Handling**: Keyboard input mapping, action triggering
5. **Animation System**: Frame updates, sprite switching

### 4. Example Test Structure

```javascript
// src/entities/__tests__/Player.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from '../Player.js';

describe('Player', () => {
  let player;

  beforeEach(() => {
    player = new Player(50, 200);
  });

  it('should jump when not already jumping', () => {
    player.jump();
    expect(player.velocityY).toBe(-12);
    expect(player.isJumping).toBe(true);
  });

  it('should not jump when already in air', () => {
    player.isJumping = true;
    player.jump();
    expect(player.velocityY).toBe(0);
  });
});
```

### 5. Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests in watch mode (for development)
npm test

# Run tests once (for CI/checking)
npm run test:run

# Run tests with UI
npm run test:ui

# Generate coverage report
npm run coverage
```

### 6. Vite Configuration

Create `vite.config.js`:

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js'
  },
  server: {
    open: true
  }
});
```

### 7. Benefits of This Structure

1. **Modularity**: Each class has a single responsibility
2. **Testability**: Individual components can be tested in isolation
3. **Maintainability**: Easier to locate and modify specific features
4. **Reusability**: Components can be reused in different contexts
5. **Type Safety**: Can add TypeScript later if needed
6. **Build Optimization**: Vite will handle bundling and optimization

### 8. Migration Strategy

1. Set up the build system (Vite + Vitest)
2. Create the folder structure
3. Extract entities (Player, Enemy, Boss) first
4. Move collision system to its own module
5. Separate rendering logic
6. Add tests for each module as you extract it
7. Update index.html to use ES modules

This refactoring will make the codebase more professional, easier to extend, and much easier to test.
