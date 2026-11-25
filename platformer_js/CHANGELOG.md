# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Scan player shot candidates without sorting per shot, preserving level order
  and enemy-before-boss priority for exact contact ties.

- Reject already-aborted sprite requests before allocating images or timers.

- Stop fixed simulation steps on win and game-over screens while continuing to
  render the overlay.

- Skip enemy and boss movement snapshots during player protection when no
  player shots are in flight.

### Security

- Bound LDtk JSON nesting, containers and tokens before native tree construction,
  including ignored metadata; rejected imports preserve the current world.

- Upgrade Vite 8, Vitest/UI/coverage 5, JSDoc and lint-staged, and refresh
  transitive dependencies; the lockfile has zero npm audit findings.
- Require Node 24 LTS or 26+; use Node 24 in CI and keep dev servers local.

### Fixed

- Keep the published sprite set ready during reloads and after failed, cancelled
  or superseded replacements.

- Draw the portal fallback and overlay when a completed sprite is broken.

- Treat a null previous platform pose as absent so overlap resolution can run.

- Advance player hit visuals and invulnerability on the simulation clock so
  pause and tab hiding preserve the remaining recovery time.

- Resolve already-open portal entry in movement order with coins and enemy or
  boss bodies, so a later body hit cannot erase an earlier level transition.

- Reject LDtk worlds when synchronous decoding, parsing or preflight reaches
  the load deadline, retaining the previous world.

- Require HTTP 200 without `Content-Range` for LDtk worlds and cancel refused
  response bodies before reading them.

- Contain disposal failures during page hide and explicit page removal so
  BFCache restoration or hot replacement can still start a fresh game.

- Cancel unread LDtk response bodies when the HTTP response fails or arrives
  after cancellation.

- Retire LDtk loads and preserve their original results when stream reader
  cleanup fails.

- Reject sprite loads with the original abort or timeout error when retiring
  the pending image source fails.

- Start a new run at level zero with a cleared score after winning. Live resets
  and game-over retries keep the current score.

- Follow the player's final position on the same frame as a respawn or stomp
  bounce.

- Continue game cleanup after a retirement failure and preserve the original
  initialization or frame error.

- Preserve LDtk append and replacement results when console diagnostics fail.

- Reject a cancelled sprite batch before publication even after its images
  finish loading, preserving the previous sprite cache.

- Release a failed page startup's game slot before cleanup and report the startup
  error even if cleanup throws.

- Release pending sprite image sources on timeout or cancellation while
  preserving completed images.

- Reject a superseded sprite batch before Game startup can activate with an
  incomplete sprite cache.

- Stop LDtk conversion at the first level that takes the candidate world over
  the aggregate platform cap, preserving the published world and level table.

- Read individual LDtk levels from raw or wrapped worlds and return `null` for
  invalid indices. Conversion errors for selected levels remain visible.

- Normalize LDtk entity pivots with admitted authored dimensions before layer
  translation; document fixed runtime collider/sprite sizes and legacy top-left
  records. Refuse malformed pivots, incomplete sizes and unsafe authored extents
  without replacing the current world, including invalid future levels.

- Preserve independent total LDtk layer offsets exactly once for collision and
  entity coordinates; reject invalid totals and unsafe normalized extents before
  publishing replacement or appended levels.

- Refuse malformed IntGrid cell values before building collision geometry;
  retain zero as empty, one as solid and other nonnegative safe integer kinds
  as noncollision without coercion or partial world replacement.

- Remove identical duplicate player world-coordinate members from the bundled
  starter export so it passes the existing strict wire admission.

- Connect Escape to visible reversible pause: freeze simulation and shots, retire
  held input and clock remainder on pause/resume, and retain one render loop.
  Ignore native key repeats after input reset; discard hidden/focus-boundary time
  and release clock listeners on disposal. Successful reset resumes fresh play.

- Retain one entry-point Game and dispose it on pagehide or hot replacement,
  including pending startup. BFCache restoration starts a fresh game without
  retaining progress; stale startup and duplicate pageshow events cannot create
  extra animation/input owners or overwrite a newer game after failure.

- Advance portal pulses from fixed simulation time with a bounded phase; drawing
  no longer changes animation state or makes pulse speed depend on refresh rate.

- Give newborn boss shots an end-of-step birth at the muzzle. Check current
  overlap at birth and defer movement/animation until the next step, preventing
  damage along player motion that happened before the shot existed.

- Resolve competing player shots chronologically within each fixed step, with
  deterministic geometric ties and fresh target checks after an earlier defeat.
  Shot storage order no longer changes combat rewards or surviving geometry.

- Sweep unlocked portal center entry across admitted post-platform movement,
  excluding respawn teleports and discarded pre-bounce motion. A portal unlocked
  during the step by a player shot that defeats the boss, or by a stomp, admits
  only the endpoint pose.

- Order swept coins and enemy/boss body effects by contact time, retaining earlier
  awards and discarding the unused path after lethal damage, respawn or stomp.

- Cull enemy draws against the camera viewport while retaining offscreen simulation;
  retire defeated actors after their 300 ms hit visual, preserving one score award.

- Query the owned static tree for swept player/platform and coin contacts; prune
  collected coin branches and rebuild ownership with every successful level.

- Index static platform/coin bounds at level creation and render only viewport
  candidates with a two-pixel margin, preserving painter order, collected coins
  and camera transforms across successful/failed level replacement and win.

- Refuse duplicate recognized LDtk Platforms/Entities layers before conversion
  or publication, retaining the old world while allowing unrelated decoration.
- Drive boss frames, renewed 400 ms hit visuals and renderer fading from coherent
  simulation time; preserve fractional frame progress across fixed steps and
  ignore wall-clock jumps/discarded suspension time.

- Measure diagonal platform support at vertical crossing time, preserving half-width
  landing support and positive ceiling overlap.
- Resolve the earliest enemy/boss body contact with deterministic geometric ties;
  recheck current poses after bounce or respawn instead of replaying old motion.
- Sweep ordinary and power-up coins across each player step, awarding once and
  excluding respawn teleports.

- Reject malformed UTF-8 and duplicate JSON members (including escaped aliases)
  before converting or publishing an LDtk world; retain the current playable world.
- Give player hit pose expiry one owned elapsed timer, keeping its 500 ms duration
  stable across system-clock jumps, protection renewal and player retirement.

- Preserve validated authored level dimensions and derive complete object extents
  for player, camera and boss-shot bounds, including tall levels and entities
  beyond the last platform. Follow vertical movement within the playable world.
- Advance enemy frames and defeated hit visuals from simulation elapsed time,
  retaining fractional frames and one defeat despite wall-clock jumps. A defeated
  boss still disappears at once (it has no death animation).

- Bound retained converted world geometry to 20,000 platforms across repeated
  appends, retaining the old table/objects on refusal and returning a boolean.
- Restore playable state and initial lives after terminal reset/replacement;
  clear stale shots/input/timers, preserve score and power-ups, and retain the
  previous terminal state on failure. Refuse reset after disposal.

- Ignore editable, composing and already prevented keyboard events, releasing held
  gameplay keys on focus changes. Scope Game input to its keyboard/pointer-focused
  canvas and prevent native defaults only for handled, unmodified gameplay keys.
  A held gameplay key is still released on keyup while a modifier is down or the
  event was prevented, so it cannot get stuck.

- Sweep boss shots relative to player motion before culling, consuming each shot
  once and retaining protection/death behavior.
- Restart the boss-shot sweep at the respawn point after a hit, so later shots
  in the same frame are not consumed along the respawn teleport.
- Classify stomps at the first relative top crossing, including moving targets
  and fast motion; reject falling side entry and preserve the boss head zone.

- Cancel retired player damage timers on successful replacement, win/death and
  disposal, while retaining timers when replacement fails.
- Share a swept-bounds broad phase across player shots, pruning distant targets
  before exact contact tests without changing hit order.

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
