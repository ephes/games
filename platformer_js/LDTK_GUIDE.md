# LDtk Level Editor Guide

## What is LDtk?

LDtk (Level Designer Toolkit) is a modern, user-friendly 2D level editor that outputs JSON files. It's perfect for creating platformer levels visually.

## Installation

1. Download LDtk from [ldtk.io](https://ldtk.io)
2. Install and run the application
3. Open the project file: `assets/levels/platformer.ldtk`

The starter world has no painted platforms. Its dense grid contains 5,000 zero
cells; draw platforms before playing it.

## Project Structure

The LDtk project is configured with:

### Layers

1. **Entities** - For placing game objects
2. **Platforms** - IntGrid layer for drawing platforms

### Entity Types

#### Player (Green Rectangle)

- Start position for the player
- Only one allowed per level
- Optional; when omitted, the start defaults to (50, 200)

#### Enemy (Red Rectangle)

- Properties:
  - `Speed`: Finite numeric movement speed (default 2; zero is stationary)
  - `PlatformIndex`: Which platform to patrol

#### Boss (Purple Rectangle)

- Properties:
  - `PlatformIndex`: Which platform to stand on
- Only one allowed per level
- Required in every imported level, including future levels

#### Coin (Yellow Circle)

- Properties:
  - `IsPowerUp`: Boolean for power-up coins (default false when absent;
    strings such as `"false"` are rejected)

#### Portal (Purple Circle)

- Level exit portal
- Only one allowed per level
- Required in every imported level, including future levels

Duplicate Player/Boss/Portal entities reject the entire import. Recognized fields
must occur at most once on their owning level/entity: LevelName, enemy Speed,
enemy/boss PlatformIndex and coin IsPowerUp. Replacement and append both validate
all candidate levels before publishing, retaining the previous world and play on
failure.

### Platform Layer

- Use the IntGrid layer to paint platforms
- Value 1 = Platform (Brown color)
- Platforms are automatically merged when adjacent
- Grid size, width and height must be positive safe integers, with safe integer
  pixel extents and at most 1,000,000 cells per Platforms layer
- Export a dense `intGridCsv` array with exactly width × height entries; use 0
  for empty cells
- Entities need finite numeric x/y coordinates. Enemy and boss `PlatformIndex`
  values must index the final merged platform array (default 0 when absent).
  That merged patrol platform must be at least 44 px wide for an Enemy or
  64 px for a Boss, including stationary enemies; exact-width surfaces are valid.
  Invalid present numeric fields or too-narrow patrol surfaces reject the import,
  retaining the active game and world when using `game.loadLDtkLevels(url)`

## Creating Levels

### Step 1: Set Level Properties

- Click on the level
- Set `LevelName` in the level fields

### Step 2: Draw Platforms

1. Select the "Platforms" layer
2. Choose the "Platform" value (1)
3. Paint platforms on the grid
4. Adjacent tiles automatically merge into single platforms

### Step 3: Place Entities

1. Select the "Entities" layer
2. Choose an entity type from the toolbar
3. Click to place entities
4. Set entity properties in the panel

### Step 4: Save and Export

- Save the project (Ctrl+S)
- The `.ldtk` file is automatically updated

## Using LDtk Levels in Game

Both options reject a world unless every level contains exactly one Boss and one
Portal (and at most one Player). The bundled starter
`assets/levels/platformer.ldtk` contains only a Player and no painted
platforms. Before importing it, paint at least one platform on the Platforms
layer that is at least 64 px wide, then add a Boss whose `PlatformIndex` points
at that platform (0 when omitted) and a Portal to `Level_0`.

### Option 1: Replace Built-in Levels

```javascript
await game.loadLDtkLevels('./assets/levels/platformer.ldtk');
```

### Option 2: Add as Additional Levels

```javascript
await game.addLDtkLevels('./assets/levels/platformer.ldtk');
```

### Standalone Conversion

```javascript
import { LDtkLoader } from './src/systems/LDtkLoader.js';

const loader = new LDtkLoader();
const world = await loader.loadWorld('./assets/levels/platformer.ldtk');
const ldtkLevels = loader.getAllLevels(world);
```

Standalone `loadWorld(url, { publish: false })` returns a candidate without
changing the published `loader.world`. By default, only the latest requested
load publishes; superseded calls still return their own candidate. Pass that
returned world to `getAllLevels(world)` to convert the intended request.
For game imports use `await game.loadLDtkLevels(url)` or
`await game.addLDtkLevels(url)` so the coordinator owns publication.

## Tips

### Platform Design

- At a 16 px grid size, use at least 3 tiles (48 px) for enemies and
  4 tiles (64 px) for bosses; other grid sizes must meet the 44/64 px minimums
- Leave space between platforms for jumping challenges
- Use different heights for variety

### Entity Placement

- Place enemies on platforms (use PlatformIndex)
- Space coins to guide player path
- Put power-up coins in challenging spots
- Place portal at the end of the level

### Testing Levels

1. Save in LDtk
2. Refresh the game in browser
3. Test your level
4. Iterate and improve

## Advanced Features

### Custom Properties

You can add more properties to entities:

- Enemy AI patterns
- Coin values
- Platform movement

### Multiple Worlds

Create separate worlds for:

- Different difficulty levels
- Bonus stages
- Test levels

## Example Workflow

1. **Sketch Level**: Plan on paper first
2. **Build Foundation**: Create main platform path
3. **Add Challenge**: Place enemies and gaps
4. **Add Rewards**: Position coins
5. **Test & Refine**: Play and adjust
6. **Polish**: Add details and balance difficulty

## Troubleshooting

### Entities Not Appearing

- Check entity layer is visible
- Verify entity properties are set
- Ensure saved after changes

### Platforms Not Solid

- Use value 1 in IntGrid
- Check platform layer is active
- Verify grid alignment

### Level Not Loading

- Save LDtk project
- Check file path in code
- Verify JSON is valid

## Integration Code Example

```javascript
// Add to Game.js
async useLDtkLevels(ldtkLevels) {
  // Replace LEVELS constant with LDtk levels
  this.levels = ldtkLevels;
  this.totalLevels = ldtkLevels.length;

  // Reload current level
  this.createLevel();
}
```

Now you can create and edit levels visually in LDtk!
