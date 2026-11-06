import { describe, expect, it } from 'vitest';
import { LDtkLoader } from '../src/systems/LDtkLoader.js';

const field = (__identifier, __value) => ({ __identifier, __value });

describe('LDtk entity fields', () => {
  it.each([
    ['Player', [], 'playerStart', { x: 35, y: 70 }],
    ['Enemy', [], 'enemies', [{ x: 35, y: 70, speed: 2, platformIndex: 0 }]],
    [
      'Enemy',
      [field('Speed', 0), field('PlatformIndex', 3)],
      'enemies',
      [{ x: 35, y: 70, speed: 0, platformIndex: 3 }]
    ],
    [
      'Enemy',
      [field('Speed', 4), field('PlatformIndex', 0)],
      'enemies',
      [{ x: 35, y: 70, speed: 4, platformIndex: 0 }]
    ],
    ['Boss', [], 'boss', { x: 35, y: 70, platformIndex: 0 }],
    [
      'Boss',
      [field('PlatformIndex', 5)],
      'boss',
      { x: 35, y: 70, platformIndex: 5 }
    ],
    ['Coin', [], 'coins', [{ x: 35, y: 70, isPowerUp: false }]],
    [
      'Coin',
      [field('IsPowerUp', false)],
      'coins',
      [{ x: 35, y: 70, isPowerUp: false }]
    ],
    [
      'Coin',
      [field('IsPowerUp', true)],
      'coins',
      [{ x: 35, y: 70, isPowerUp: true }]
    ],
    ['Portal', [], 'portal', { x: 35, y: 70 }]
  ])('converts %s with fields %j', (identifier, fields, property, expected) => {
    const loader = new LDtkLoader();
    const level = loader.convertLevel({
      identifier: 'Synthetic',
      fieldInstances: [],
      layerInstances: [
        {
          __identifier: 'Entities',
          entityInstances: [
            {
              __identifier: identifier,
              px: [35, 70],
              fieldInstances: [field('Unrelated', 99), ...fields]
            }
          ]
        }
      ]
    });

    expect(level[property]).toEqual(expected);
  });

  it.each([0, false, null])(
    'preserves explicit %j rather than using a fallback',
    value => {
      const loader = new LDtkLoader();
      const entity = { fieldInstances: [field('Value', value)] };
      expect(loader.getFieldValue(entity, 'Value', 'fallback')).toBe(value);
      expect(loader.getFieldValue(entity, 'Missing', 'fallback')).toBe(
        'fallback'
      );
    }
  );
});
