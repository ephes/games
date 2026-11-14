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

- Publish sprite batches atomically, retaining the previous complete cache after
  failure or supersession while preserving direct per-key request ownership.
- Bound image loading to 10 seconds by default, support optional cancellation,
  and release callbacks/timers on every outcome. Abort sibling images on batch
  failure/supersession and pending startup images on Game disposal.

- Ignore starts before/during initialization without retiring the game or
  accessing an unconstructed world. Start explicitly after successful init;
  retain one animation chain and terminal initialization failures/disposal.

- Sweep player shots against moving targets and select the earliest contact
  across enemies and the boss, retaining one hit/reward and resolving contact
  before off-screen culling. Break distinct equal-time hits by geometry.

- Use monotonic time for player and boss shot cooldowns, preserving immediate
  first shots and player cooldowns through level reloads despite clock changes.

- Sweep vertical player motion to the first platform or ceiling crossed, retaining
  the horizontal support threshold and removing platform-order dependence.
- Restore all owned canvas scopes on drawing failures, including nested portal,
  sprite and fireball drawing, so a fresh game can reuse the canvas safely.

- Release failed sprite batches for retry and let only the current batch mark
  loading complete. Keep the latest requested sprite and retain cached images
  when a replacement fails.

- Validate Boss/Portal presence in every replacement/appended LDtk level before
  publication, and preserve the current index and objects on transition failure.
- Reject duplicate LDtk Player/Boss/Portal entities and recognized fields;
  require boolean coin IsPowerUp values while retaining absent-field defaults.

- Bound LDtk transfers to 16 MiB and 10 seconds; abort superseded/disposed loads
  and parse modern raw LDtk records without publishing partial imports.
  The unused `ldtk` runtime dependency is removed.
- Preflight aggregate world levels, cells and entities, bound active platforms
  and entities, and cap appended level tables while preserving play on refusal.

- Reject player-shot creation before initialization and after win, death or
  disposal, including direct calls; retain live power-up and cooldown behavior.

- Reduce platform right edges without argument-count limits for large LDtk worlds.
- Keep defeated boss health at zero and reject further damage/rewards without
  repeating hit effects or projectile cleanup.

- Share concurrent and repeated initialization, register controls once, and retain
  startup failures without retrying a disposed game.
- Dispose input and animation ownership on update/render failure while
  propagating the original error to the caller or browser.

- Reject imported patrol surfaces narrower than their enemy (44 px) or boss
  (64 px), preserving the previous playable world on failure.

- Restart player hit and invulnerability timers on renewal so older expirations
  cannot clear newer protection or hit visuals.
- Deliver input actions to a stable subscriber snapshot so self-removal does not
  skip the next listener.

- Award an enemy's defeat once and remove collisions immediately while its hit
  animation finishes, preserving boss health behavior.
- Bound boss shots by the active level with finite off-world margins, and
  preserve explicit zero boss speed just like ordinary enemies.

- Own one animation chain per game, make disposal terminal, and release input on
  failed or cancelled initialization.
- Publish only the latest replacement/append LDtk import from its own candidate
  world; obsolete completions and failures cannot change the active level.
- Run bounded fixed 60 Hz simulation steps independently of display refresh rate,
  discarding suspension time while retaining elapsed-time cooldowns.

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

- Test boss-shot sprite and fallback composition through Game.render with a
  translated recording context, immutable world coordinates and inactive shots.

- Cover real Enemy running/hit animation cycles, player Projectile movement,
  culling and drawing, and Camera bounds, visibility and coordinate transforms
  with synthetic fixtures and controlled clocks/canvas contexts.

- Replace surrogate animation/input tests with production Player and InputManager
  coverage for animation priority, frame counts, renewal and action delivery.

- Test production platform contact boundaries and entity mutation, sprite geometry
  and canvas state isolation, and one-time coin awards/power-ups through Game.

- Remove the unused duplicate level coordinator and describe Game's maintained
  progression/import ownership in levels.md.

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
