# Platformer JS

A modular 2D platformer game built with HTML5 Canvas and JavaScript ES modules. Works directly in the browser without any build step!

## 🎮 Game Features

- Side-scrolling platformer with multiple levels
- Player character with run, jump, and shoot abilities
- Enemy AI with platform patrol behavior
- Boss fight with health system
- Collectible coins and power-ups
- Win condition with portal exit
- Sprite-based animations

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
```

### Running the Game

#### Development Server (Recommended)

```bash
# Start development server with hot reload
npm run dev
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

The project uses Vitest for unit testing with 56+ tests covering game logic.

```bash
# Run tests in watch mode
npm test

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
│   ├── entities/     # Player, Enemy, Boss, Projectile
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

## 🚀 GitHub Pages Deployment

The game is configured for easy GitHub Pages deployment:

1. Enable GitHub Pages in your repository settings
2. Set source to "GitHub Actions"
3. Push to main branch - the workflow will automatically deploy

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
