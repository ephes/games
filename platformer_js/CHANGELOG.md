# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
