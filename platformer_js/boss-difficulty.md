# Boss Difficulty Adjustments

## Changes Made for Easier Testing

To make it easier to test Level 2 and subsequent levels, the boss difficulty has been reduced:

### Health Reduction

- **Previous**: 10 health points
- **New**: 3 health points
- **Impact**: Boss can be defeated with just 3 hits instead of 10

### Projectile Speed Reduction

- **Previous**: 5 units/frame
- **New**: 3 units/frame
- **Impact**: Fireballs are 40% slower, giving more time to dodge

### Shooting Cooldown Increase

- **Previous**: 1.5 seconds between shots
- **New**: 3 seconds between shots
- **Impact**: Boss shoots half as frequently

### Shooting Range Reduction

- **Previous**: 600 pixel range
- **New**: 400 pixel range
- **Impact**: Boss only starts shooting when player is closer

## Testing Benefits

These changes make it significantly easier to:

- Quickly defeat the boss and reach the portal
- Test level transitions without dying repeatedly
- Focus on level design and gameplay mechanics
- Debug multi-level features

## Reverting Changes

To restore original difficulty, change these values in `src/entities/Boss.js`:

```javascript
this.health = 10;
this.maxHealth = 10;
this.shootCooldown = 1500;
this.shootingRange = 600;
const projectileSpeed = 5;
```

And update the corresponding test values in `tests/Boss.test.js` and `tests/PlatformerGame.test.js`.
