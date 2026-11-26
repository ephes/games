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

The project uses Vitest for unit testing covering game logic. Tests exercise
the production Player and InputManager, including animation precedence/frame counts,
renewed hit/protection counters and self-removing action subscribers. Player tests
advance simulation steps independently of fake wall time; input tests dispose
every DOM listener after each case. Collision tests call the production system
with synthetic rectangles: touching edges do not overlap,
landing needs at least 50% horizontal support while falling, and an upward
ceiling hit stops vertical speed without clearing jumping state. Game passes the
player's previous x/y pose into collision resolution, so fast movement hits the first
crossed support/ceiling even through thin geometry, independent of platform order.
Horizontal overlap is evaluated at the vertical crossing time: landing requires
50% support and ceilings require positive overlap. Diagonal movement cannot gain
support by entering after crossing the top or lose contact by leaving afterward.
Direct collision callers can omit the previous pose or pass `null` to resolve existing overlaps;
legacy Y-only snapshots retain fixed-X behavior. Renderer tests
record sprite source/destination geometry, facing transforms and canvas state
restoration without pixel snapshots. Coin tests verify one award, hidden
collected geometry and real Game scoring/power-up behavior across repeated
collision frames. All fixtures are synthetic and need no network assets. Loader tests run
real LDtk world/level conversion, entity field lookup and IntGrid collision mesh
merging against synthetic records, mocking only streamed `fetch` responses. Sprite loader
tests use explicitly triggered Image load/error events to check cache identity,
out-of-order completion, fake deadlines and failed startup without network requests.
SpriteLoader batches can be retried after failure. Only the newest complete batch
publishes its images together. `loaded` starts false and becomes true with the
first successful publication. It stays true while a replacement is pending and
if that replacement fails, is cancelled or is superseded.
`loadAll()` resolves only after its own batch publishes. Cancellation or
supersession before publication rejects with an `AbortError`, even if every
image has finished loading. Game initialization then fails before creating a
renderer, level or input handlers.
Failed, cancelled or superseded batches retain the complete previous cache,
including when retired images finish late. Direct `loadSprite` requests retain
per-key ownership. Superseding one batch key prevents the entire batch from
publishing.
Each sprite key belongs to its latest request: retired completions cannot replace the cache, and failed
replacements retain the last valid image. `loadSprite()` rejects with an
`AbortError` if cancelled before publication, even after the image finishes
loading. Game initialization remains terminal
on failure as described below; retry the loader directly or create a fresh Game.
`loadSprite(name, path, { signal, timeoutMs })` and `loadAll({ signal, timeoutMs })`
accept an optional AbortSignal and a positive finite per-image deadline (default
10 seconds, maximum 2,147,483,647 ms). Error, timeout, abort and success release
callbacks, timers and signal listeners. Failed batches abort their remaining
images, including when setup throws after some images have started. A new
batch aborts its predecessor. Game disposal aborts initialization
images; startup failure remains terminal for that Game.
An already-aborted signal rejects with `AbortError` before either loader
creates images or timers, leaving existing requests and cached sprites intact.
Timeout and abort attempt to remove the pending image's `src` attribute.
The promise rejects with the original failure even if source removal throws.
Completed images keep their sources. The Chromium suite holds a synthetic
image request open and checks source removal and cache identity after cancellation.
Direct Enemy tests advance simulation elapsed milliseconds: running frames 0–9
cycle at 15 fps and hit frames 0–4 at 20 fps, carrying fractional frame time
across steps. A hit resets the frame clock and retires its visual after 300 ms
of simulation, independent of system-clock changes. Split elapsed steps produce
the same frames and retirement; suspended time discarded by Game is not replayed.
Player Projectile tests cover a fixed 10 px step in either direction and
inclusive viewport margins: x at `cameraX - 100` or
`cameraX + screenWidth + 100` remains in bounds; only points beyond retire.
These player-shot limits differ from boss shots' world bounds.
Player shots sweep their whole step against enemies and the boss, accounting for
both projectile and target movement. Each step builds one balanced tree of
target swept bounds, shared by all player shots. Queries prune disjoint subtrees
before exact contact tests; dense intersecting targets still require exact tests.
The conservative bounds include target motion. Each query walks candidates in
tree order without sorting; exact contact selection uses their original level
order to break ties between identical rectangles.
Competing shots resolve in contact-time order across the whole fixed step. A shot
whose selected target was defeated earlier checks its path again for the next
live target. Simultaneous shots use pre-step x/y/width/height, then endpoint
x/y/width/height order; identical trajectories are interchangeable and retain
storage order. The earliest live contact takes one hit;
contacts are resolved before off-screen culling. Equal-time contacts use target
x/y/width/height order, then enemy before boss; identical enemy rectangles keep
level order. Stationary edge touches and tangential grazing do not hit. Drawing subtracts
cameraX once without moving world coordinates. Camera tests use translated
bounds and a recording canvas to check follow/clamp, touching-edge visibility,
coordinate conversion, transforms and reset, without changing camera policy.
Game rendering integration tests record boss-shot fallback arcs and sprite frame
coordinates under the parent camera transform: each path translates world space
once, leaves shot coordinates unchanged and balances context save/restore.
Level creation snapshots platform and coin bounds into a balanced static tree.
Rendering queries the camera's world-space viewport with a two-pixel margin
(including the power-up coin stroke) and draws only intersecting candidates in
original painter order: platforms, then coins. Touching edges are included;
collected coins keep their index entry and draw nothing. Camera translation is
still applied exactly once. Platform/coin geometry is static until the next
successful level creation; changing its coordinates directly requires recreating
the level. Failed construction retains the previous index, while transitions,
resets and imports replace it and winning clears it. The same tree queries the player's swept bounds for platform and coin collision
candidates, retaining level order and the existing narrow-phase rules. Collected
coins retire from collision queries, including whole exhausted subtrees; resets
and level replacement rebuild candidate ownership. Canvas regressions cover 10,000 off-screen
objects of each kind, viewport/margin edges, painter order and level replacement.
Inactive boss shots draw nothing. Every saved canvas scope restores in `finally`,
including nested sprite, portal and fireball scopes. Rendering failures retain
loop disposal/error propagation and allow a fresh Game to reuse the same canvas.
Boss hit flashes tint the current frame on a reusable sprite-sized canvas. The
main canvas scales and flips that frame as usual, leaving terrain and enemies
visible through transparent sprite pixels. The Chromium smoke checks those
pixels in both facing directions.

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

Shooting requires successful initialization and a playable game. Both direct
`game.shoot()` calls and input actions ignore win, death, disposal and pending or
failed initialization without allocating projectiles or consuming cooldown.
Live resets, same-level retries after death, level transitions and LDtk
replacements preserve score, shooting ability and cooldown. A successful reset
or replacement after win/death restores initial lives and a playable player.
Reset after winning starts a new run at level zero with zero score and no shooting
power-up or cooldown from the previous run. The first shot is available as soon
as the player collects a new shooting power-up. Failed construction retains the
previous run state and objects. A disposed Game cannot reset.
Win and game-over screens keep rendering while simulation is stopped. A
successful reset starts with a fresh simulation clock.
Successful resets/replacements clear both sides' projectiles, held input and
retired player recovery counters. `resetLevel()` returns true on reset and false
after disposal. Construction errors still propagate.

Click or Tab to the canvas to give that game keyboard focus. Only the focused
canvas responds; moving focus away releases held keys. Handled, unmodified keys
cancel native scrolling while focused. Tab, browser shortcuts, unrelated keys,
text inputs, selects, contenteditable regions, IME composition and already
prevented events remain available to their native owners; a gameplay key that is
already held is still released on its keyup, even with a modifier down. Action
listeners receive a release only for a held key. After a focus reset, releasing
a key still cancels native scrolling on the focused canvas. Standalone
`new InputManager()` retains document delivery with the same editing filters;
pass a focusable surface to scope it to a game.

Switching windows or hiding the tab clears held movement and shooting keys.
Press again after returning. Successful level replacement, win, death and
disposal retire both player recovery counters. Failed level construction
retains the active player and its counters. `player.dispose()` is idempotent
and terminal for recovery renewal. Call `game.dispose()` before replacing a game
to cancel its animation and remove input listeners. Standalone input managers have
`dispose()` too. Call `await game.init()` before `game.start()`. Starts before or during
initialization are ignored without disposing the game or requesting an animation
frame; call `start()` again once initialization succeeds. Starting twice keeps
one animation chain. Disposal is terminal:
create a fresh Game to restart.
The `main.js` entry point owns one current Game, including while sprites load.
Every `pagehide` releases the current game slot before attempting disposal.
A persisted `pageshow` (BFCache return) starts a fresh game at level zero with
initial score/lives; progress is not restored.
Ordinary tab hiding releases held input, suspends simulation and keeps the current
game. Visibility/focus boundaries discard partial and missed simulation time.
Duplicate restore events do not start extra games or retry failed startup;
after failure, another hide/restore cycle can try a fresh Game. The entry point
releases the failed game's slot before cleanup and reports the original startup
error even if cleanup also fails. Retired startup completions cannot start or
replace the current game. Vite hot replacement calls
`disposePage()` before reinitializing; embedders removing the entry point can call
that same terminal cleanup to release its DOM/page listeners and Game.
Both retirement paths report disposal failures to the console and return normally.

Game construction requires a 2D canvas context before it registers input or
starts loading sprites. If listener registration fails during construction, the game releases partially
registered DOM listeners before propagating the startup error. A fresh Game can
then claim the same canvas.

Concurrent and later `init()` calls share one initialization and register controls
once. Failed initialization disposes input; every later `init()` call rejects
with the same startup error. Create a fresh Game to retry. Disposal during sprite
loading prevents later activation: before the sprite batch publishes,
`init()` rejects with an `AbortError` (callers that dispose on purpose can ignore
that error). If disposal follows publication but precedes activation, `init()`
resolves without activating the game. Update/render failures also dispose the game
and rethrow the original error: synchronous startup errors reach the caller of
`start()`, and scheduled-frame errors reach the browser error surface.
Disposal attempts each loader, animation, input, listener and player retirement
once. A direct `game.dispose()` call throws after all attempts if cleanup fails,
using `AggregateError` for multiple failures. During initialization or a game
frame, cleanup failures are reported separately through the console and the
original error still propagates.

With the canvas focused, Escape toggles a visible **Paused - Esc to resume**
message. Pause freezes simulation (movement, collisions, projectiles and animation)
and refuses player shots, including direct `shoot()` calls. Rendering continues
on the same animation chain. A fresh Escape press resumes; native key repeat
cannot toggle pause or revive a held movement/shooting key after input reset.
Both transitions discard held input and accumulated time, and the first resumed
frame establishes a fresh clock baseline. Focus/visibility changes retain manual
pause. Successful level reset or world replacement resumes play with fresh input
and clock state; a failed replacement keeps the previous state. Disposal releases
the pause handler and clock listeners along with the existing input/RAF ownership.
Player recovery freezes while paused or hidden. Shooting cooldowns continue
to use elapsed real time.
Unit and Chromium journeys exercise real Escape input, repeats, focus, restart
and disposal; unit fixtures also cover short hidden intervals and failed reset.

Portal pulses advance by simulation elapsed time (3 radians per second), wrapping
at 2π for both locked barriers and unlocked glows. Drawing never advances their
phase; extra renders and different display refresh rates show the same simulated
state. Terminal game states freeze the phase, and level creation starts it at zero.
A missing, pending or broken portal image uses the geometric fallback, with the
usual lock barrier or unlocked glow. The Chromium suite verifies the fallback
and lock label after a real image decode failure.

Simulation uses fixed 60 Hz steps and renders once per animation frame. A frame
can run at most five simulation steps; gaps over 250 ms discard accumulated time
so returning from suspension does not replay missed movement. Player and boss shooting cooldowns use monotonic `performance.now()` time,
so changing the system clock cannot stall or bypass them. The first shot is
immediately available; live player level reloads preserve the cooldown.
Boss frames and hit fading use accumulated simulation elapsed time: the eight-frame
ping-pong sequence advances every 200 ms, retaining fractional time, and each
accepted hit renews a 400 ms visual. Wall-clock jumps and discarded suspension
time do not advance or freeze these visuals; defeated bosses still disappear
immediately. With `window.DEBUG_BOSS` enabled, boss animation logs are best
effort. A console error leaves animation timing and the game loop running.

Player hit visuals and invulnerability both advance on simulation steps.
Renewing protection restarts both counters. The hit visual lasts 500 ms and
protection lasts the requested duration (2,000 ms by default). Expiry takes
effect before that step’s animation selection and collision checks.
Action delivery uses the subscribers present at the start of each edge; changes
to subscriptions take effect on the next edge.

Camera, player and boss-shot bounds refresh together on level creation,
transitions, resets and LDtk replacement. The camera follows the new spawn within
those bounds before the first render, even when no simulation step runs.
Imported `pxWid`/`pxHei` are retained
as level `width`/`height`: when supplied, both must be positive safe integers.
Legacy records with neither dimension and built-in levels derive complete extents
from platforms, the player start, enemies, coins, boss and portal rectangles.
Bounds include negative origins, every object edge and at least one viewport;
authored dimensions provide additional empty playable space. Game follows both
horizontal and vertical player movement inside these bounds. This establishes
spatial reachability; authors still provide platforms/jump routes to exits.
Large collision meshes are reduced without spreading into function arguments.

Coins, enemy/boss body contacts and already-open portal entry resolve in
earliest-contact order within a step. Exact ties resolve coins first, then
body contact, then portal entry. A transition keeps coin awards up to entry.
Stomps and respawns replace unused motion with current-pose overlaps, where
coins and open portals can still trigger. Unlocked portals test the player's
center along the movement admitted by platform resolution, using the usual
center-radius threshold. Fast crossings can enter with both endpoints outside.
A portal unlocked during the step by a player shot or stomp admits only the
endpoint pose.

Damage respawns the player at the active level's start, clearing vertical speed
and jumping state while retaining the usual life loss and invulnerability.
The camera follows the final same-level position on the respawn or stomp frame.
Player-shot culling uses the viewport from before contact resolution, and level
handover resets the camera.
Enemies accept one defeat and award 50 points once, even when bullets and a
stomp overlap. Defeated enemies stop moving/colliding immediately while their
300 ms hit animation remains visible. After its final hit frame, the level retires
the enemy before building collision candidates. Rendering uses the camera's
inclusive viewport against each enemy's destination rectangle, which contains
both run and hit sprites in either facing; offscreen enemies still simulate. Boss damage awards 20 points per nonfatal
hit and 200 once on defeat. Health stops at zero; subsequent `hit()` or
`takeDamage()` calls return zero without changing hit state or repeating projectile
cleanup.
Programmatic enemy and boss configurations preserve speed zero as stationary;
omitted speed defaults to 2. Boss shots use the active level's camera bounds,
with a 200 px horizontal and 100 px vertical off-world margin. Recreating a level
replaces its boss and projectile collection.

Established boss shots sweep relative to the player's pre-step position, resolving
contact before off-world culling. Boss shots created during an update are born
at the end-of-step muzzle position: they do not move or animate until the next
step, and only overlap with the player's current pose can hit at birth. Earlier
player movement cannot collide retroactively with a newborn shot. From the next
step onward they use the usual relative sweep. Each shot is consumed once, even during
protection. Stomps require the first relative contact to cross the enemy top
downward; falling side entry causes damage. The boss head center is evaluated
at that contact (central 40%, inside its top 20%). Fast top crossings therefore
still bounce above the target without awarding a second defeat. Direct
collision callers without snapshots infer vertical motion from velocity and
retain the boss penetration limit; Game supplies both actual pre-step positions.

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
imports completed after disposal do not publish. Supersession and disposal abort
pending transfers. A cancelled load settles even if fetch or a body reader
remains pending. Each load has a 10-second monotonic deadline covering the
transfer, UTF-8 decoding, JSON parsing and world preflight. The loader checks the
deadline after each read, including end of stream, and again before publication.
It skips empty chunks and cancels the reader if more than 64 consecutive reads
deliver no bytes. The streamed response limit is 16 MiB of delivered bytes.
A present `Content-Length` must be a single unsigned decimal integer.
For identity encoding, the delivered byte count must
match that length. Compressed responses, CORS responses with hidden encoding,
and responses without a declared length use the delivered byte limit.
The loader requires HTTP 200 without a `Content-Range` header for a world
download. It cancels the unread body if the response fails that check or
arrives after cancellation, preserving the previous world.
The loader requires valid UTF-8 and refuses duplicate JSON member names in any
object, including names written with equivalent Unicode escapes. Before
`JSON.parse` constructs the tree, a quoted-token pass admits at most 64 nested
objects/arrays (root included), 1,000,000 total containers and 6,000,000 tokens
(member names, scalar values and container openings). Ignored metadata counts
toward every limit, so tiny or deeply nested metadata cannot bypass the wire
expansion envelope. These limits accommodate the aggregate gameplay cell budget
and the world entity budget below together, with LDtk-shaped entity records
(including field instances). Native `JSON.parse` validates syntax; a second quoted-token
pass checks decoded key identities per object before conversion or
publication. Wire refusal keeps the current playable world. Legal Unicode and
names repeated in separate objects remain supported. The loader uses raw LDtk records, including modern `intGridCsv`.

`ldtkLoader.getLevel(index)` accepts a published world with `levels` directly
or under `data`. It returns `null` when no world is loaded or the index is
outside the range of zero-based integer indices. Errors converting a selected
level propagate to the caller.

Before conversion, each imported world is limited to 64 levels, 2,000,000 total
IntGrid cells and 20,000 total entities across all layers. A level may contain at
most 1,024 source entities and 4,096 horizontal collision runs/platforms, bounding
active collision/render scans. These limits include unknown entities/layers in
source totals. Append also caps the combined table at 64 levels and 20,000
recognized entities. Both replacement and append also cap total converted
platform geometry at 20,000 platforms. Candidate levels are converted in order,
and conversion stops at the first level that takes the candidate over the cap.
Append also checks the combined platform count including the existing table.
`addLDtkLevels(url)` returns true on publication and false on refusal, empty input,
supersession or disposal. Over-budget imports report the exceeded budget and retain
the current playable world.

Replacement and append imports validate every candidate level, including future
levels, before publishing. Each level admits at most one `Platforms` layer and
one `Entities` layer; duplicate recognized identifiers refuse the whole import
instead of ignoring authored content. Unrelated layers, including repeated
decoration identifiers, remain allowed and count toward source budgets. Each
level requires one Boss and one Portal; Player
may be omitted to use the default start at (50, 200). Duplicate Player, Boss or
Portal entities are rejected. Recognized fields (`LevelName`, enemy `Speed`,
enemy/boss `PlatformIndex`, coin `IsPowerUp`) must occur at most once on their
owning level/entity. `LevelName` must be a string when present. If the field is
absent, the level's string `identifier` supplies the HUD label. `IsPowerUp`
must be a boolean when present and defaults to false when absent. A failed
next-level construction leaves the current index, objects, projectiles and
camera intact and rethrows the error. Direct `loadNextLevel()` callers may retry; during normal play the game loop disposes the
game on that error, so a live game does not recover by itself.

LDtk Platforms layers require positive safe integer grid size, width and height,
with safe integer pixel extents and at most 1,000,000 cells per layer.
`intGridCsv` must be an array containing exactly `width * height` cells, including
zero cells for empty space. Every cell must be a nonnegative safe integer:
value 1 creates collision geometry; other positive kinds remain noncollision
values. Strings, booleans, nulls, fractions, negative/unsafe integers, nonfinite
values and sparse adapter arrays are refused before constructing geometry. A level may omit
the Platforms layer entirely when no enemy or boss needs a patrol surface.
Recognized Platforms/Entities layers apply `__pxTotalOffsetX/Y` exactly once to
grid/entity positions. Each optional axis defaults to zero only when absent;
present totals must be signed safe integers. Totals already include definition
and instance offsets, so `pxOffsetX/Y` are not added again. Level `worldX/Y` and
entity `__worldX/Y` are not part of this level-local import. Different layer
totals remain independent, including negative origins. Normalized grid extents
(including empty grids) and entity runtime rectangle edges must be finite and
within ±`Number.MAX_SAFE_INTEGER`; invalid future levels refuse the entire
replacement or append before publication. The default omitted-Player start
stays at level coordinates (50, 200). See the [LDtk JSON schema](https://ldtk.io/files/JSON_SCHEMA.json).

Recognized entities require finite numeric x/y coordinates. Entity `px` is an
anchor: the importer produces top-left coordinates as
`px - __pivot * authoredSize + totalLayerOffset` on each axis. A missing
`__pivot` defaults to `[0,0]`; a present pivot must contain exactly two finite
numbers in `[0,1]`. If either authored `width` or `height` is present, both must
be positive safe integers. A nonzero pivot requires both authored dimensions;
legacy records with neither dimension remain supported only with a zero/absent
pivot. Malformed present metadata is refused, including for zero pivots.
Both the authored rectangle and runtime rectangle must fit the numeric extent
contract above. For example, a 44×30 enemy anchored at (100,100) with pivot
(0.5,1) becomes (78,70), before layer translation.

Authored dimensions describe anchor geometry; they do not scale runtime sprites
or colliders. Fixed runtime sizes are Player 30×30, Enemy 44×30, Boss 64×96,
Coin 20×20 and Portal 128×128. Differing authored dimensions are supported for
anchor normalization, while the runtime rectangle begins at the resulting
top-left. Runtime sizes never substitute for missing authored anchor dimensions.

Enemy `Speed` must be finite and nonnegative. Zero stays stationary, and
positive fractional speeds move by that amount per simulation step. Enemy and
boss `PlatformIndex` must be an integer in the final merged platform array.
Missing fields default to speed 2 and platform index 0. Present strings, nulls
and nonfinite values are rejected.
The referenced merged patrol platform must be at least 44 px wide for an enemy
or 64 px for a boss, including stationary enemies. Exact-width surfaces are
valid; narrower surfaces fail conversion with an authoring error naming the
entity and minimum width before the candidate world is accepted.
Conversion throws on invalid data, and `game.loadLDtkLevels(url)` returns `false`
while retaining the previous playable state, including the loaded world.

Lethal enemy, boss or boss-projectile contact ends the update immediately
when resolved. Coins sweep the
player's pre-step pose to its current pose, awarding each ordinary
or power-up coin once even without endpoint overlap. Tangent edges do not collect;
a boss-shot respawn retires the old pose so the teleport collects nothing in between.
Body contacts choose the earliest relative contact across enemies and boss, with
the same geometric ties as player shots. The game saves pre-movement target
poses for both. Invulnerability filters damaging body contacts out of that
order, so an earlier side contact cannot prevent a later valid enemy or boss
stomp.
After bounce/respawn, checks restart at current poses rather than continuing
the retired sweep. Coins are checked
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
