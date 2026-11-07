# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Upgrade Vite 8, Vitest/UI/coverage 5, JSDoc and lint-staged, and refresh
  transitive dependencies; the lockfile has zero npm audit findings.
- Require Node 24 LTS or 26+; use Node 24 in CI and keep dev servers local.

### Fixed

- Own one animation chain per game, make disposal terminal, and release input on
  failed or cancelled initialization.
- Publish only the latest replacement/append LDtk import from its own candidate
  world; obsolete completions and failures cannot change the active level.
- Run bounded fixed 60 Hz simulation steps independently of display refresh rate,
  discarding suspension time while retaining wall-clock cooldowns.

- Reject malformed LDtk IntGrid dimensions, unsafe pixel extents, grids over
  1,000,000 cells and cell arrays that do not match the declared dimensions
  before scanning or replacing the active world. Normalize the bundled empty
  starter grid to 5,000 zero cells so it remains compatible.
- Reject nonnumeric/nonfinite imported entity coordinates and enemy speeds,
  and enemy/boss references outside the converted platform mesh. Keep missing
  field defaults, preserve explicit zero enemy speed and retain play on failure.

- Keep boss head-only stomps stable when production builds rename constructors.
- Respawn at the active level start after damage, clearing vertical movement and
  jumping state, including after level transitions and LDtk replacement.
- Construct LDtk replacement objects before publishing them; retain a valid
  current index or select zero, preserve play on failure, and return a boolean
  replacement result.
- Stop the death frame immediately after lethal enemy, boss or fireball damage
  so it cannot also advance a level or win.
- Clear held keys on window blur or hidden tabs and support explicit input/game
  disposal with animation cancellation.
- Refresh camera and player bounds from current platform geometry on level
  creation, transitions, resets and LDtk replacement.

### Development

- Run synthetic Chromium frame-schedule smoke tests in branch and main CI.

- Test real LDtk world conversion, entity fields (including zero/false values),
  and collision mesh adjacency with synthetic fixtures.
- Test the real sprite loader's cache, completion ordering and image failures
  with controlled Image events.

- Check PRs and main pushes with read-only install, lint, format, test, game build
  and documentation build steps. Pages publication is manual and opt-in.

### Added

- Boss fireball attack system with animated projectiles
- BossProjectile entity class with 4-frame animation
- Shooting mechanics for boss (600px range, 1.5s cooldown)
- Automatic projectile cleanup when boss is defeated
- Tests for boss projectile system (bringing total to 93 tests)

### Changed

- Boss now actively attacks the player with fireballs
- Increased boss shooting range from 400px to 600px
- Decreased boss shooting cooldown from 2s to 1.5s

## [0.1.0] - 2024-06-21

### Added

- ES module structure with clean separation of concerns
- Comprehensive test suite with 56+ tests using Vitest
- JSDoc documentation generation
- GitHub Actions workflow for automated deployment
- Pre-commit hooks with ESLint and Prettier
- Development server with hot reload support
- Build system using Vite

### Changed

- Refactored monolithic `game.js` (900+ lines) into modular ES6 structure:
  - Separate modules for Player, Enemy, Boss, Projectile entities
  - Dedicated systems for Input, Collision, Camera, and Sprite loading
  - Clean separation of rendering logic
  - Organized game objects (Platform, Coin, Portal)
- Updated to use ES modules throughout the codebase
- Improved code organization with proper folder structure

### Fixed

- Double jump bug - player can no longer jump while already in the air
- Platform edge jumping - player now needs at least 50% overlap with platform to be considered grounded
- Various linting and code quality issues

### Security

- Added `.eslintignore` to exclude third-party files from linting
- No secrets or API keys in codebase

## [0.0.1] - Original Prototype

- Initial game implementation as single monolithic file
- Basic platformer mechanics with player movement and jumping
- Enemy AI with platform patrol behavior
- Boss fight with health system
- Collectible coins and power-ups
- Portal-based level completion
- Sprite-based animations
