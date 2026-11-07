# Level Progression Tracking

## Current Implementation Status

### ✅ Completed

- **Multi-level data structure**: Refactored constants to support multiple levels
- **Level 1 - "The Beginning"**: Original level with boss
- **Level 2 - "Sky Castle"**: New level with staircase pattern and more enemies
- **Level transitions**: Portal-based level progression implemented
- **Player state persistence**: Power-ups are kept between levels
- **Level indicator UI**: Shows current level name and number
- **Progression tests**: Synthetic tests exercise transitions, resets and imports
- **Camera reset**: Camera resets position when loading new level
- **Victory condition**: Game shows win screen after completing all levels

### ✅ Additional Completed Features

- **Single coordinator**: Game owns construction, transitions, resets and LDtk replacement
- **Validation**: Unit tests, lint/format and production/documentation builds
  cover the maintained coordinator; lint retains three console warnings
- **LDtk imports**: Validated conversion with latest-request publication

### 📋 TODO

- Add level transition animations/effects
- Create more levels (Level 3+)
- Add level select menu
- Save/load progress between sessions

## Level Design Notes

### Level 1 - "The Beginning"

- Standard platformer introduction
- Single boss at the end
- Power-up coins for shooting ability
- Linear progression

### Level 2 - "Sky Castle"

- Vertical progression with staircase pattern
- More challenging enemy placement
- Multiple platform layers
- Increased enemy speed (speed: 4)
- Longer level (3500 width vs 3000)

## Technical Details

### Level Structure

```javascript
{
  name: "Level Name",
  playerStart: { x: 50, y: 200 },
  platforms: [...],
  coins: [...],
  enemies: [...],
  boss: {...},
  portal: {...}
}
```

### Implementation Features

- **Dynamic level loading**: Game starts with LEVELS and can replace or append LDtk levels
- **State preservation**: Player abilities persist between levels
- **Clean transitions**: Objects are cleared before loading new level
- **Victory detection**: Game detects when all levels are completed

## LDtk Editor Integration

Use `await game.loadLDtkLevels(url)` to replace levels or
`await game.addLDtkLevels(url)` to append them. See [LDTK_GUIDE.md](LDTK_GUIDE.md)
for editor setup. Game constructs replacement objects before publishing, and
only the latest requested import may publish. Synthetic progression and import
tests exercise those paths; this does not claim exhaustive coverage.
