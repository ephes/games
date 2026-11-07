import { describe, expect, it } from 'vitest';
import { LDtkLoader } from '../src/systems/LDtkLoader.js';
import { Enemy } from '../src/entities/Enemy.js';

const entity = (__identifier, fields = []) => ({
  __identifier,
  px: [35, 0],
  fieldInstances: fields
});
const field = (__identifier, __value) => ({ __identifier, __value });
const source = object => ({
  identifier: 'Synthetic',
  fieldInstances: [],
  layerInstances: [
    { __identifier: 'Entities', entityInstances: [object] },
    {
      __identifier: 'Platforms',
      __gridSize: 16,
      __cWid: 8,
      __cHei: 1,
      intGridCsv: Array(8).fill(1)
    }
  ]
});

// Include values JSON can represent plus nonfinite values from parsed adapters.
const invalidNumbers = [
  'fast',
  null,
  undefined,
  NaN,
  Infinity,
  -Infinity,
  true
];

describe('LDtk imported numeric contract', () => {
  it.each(
    ['Player', 'Enemy', 'Boss', 'Coin', 'Portal'].flatMap(kind =>
      [0, 1].flatMap(axis => invalidNumbers.map(value => [kind, axis, value]))
    )
  )('rejects %s coordinate %s = %s', (kind, axis, value) => {
    const object = entity(kind);
    object.px[axis] = value;
    expect(() => new LDtkLoader().convertLevel(source(object))).toThrow();
  });

  it.each(invalidNumbers)('rejects a present malformed speed %s', speed => {
    expect(() =>
      new LDtkLoader().convertLevel(
        source(entity('Enemy', [field('Speed', speed)]))
      )
    ).toThrow();
  });

  it.each(
    ['Enemy', 'Boss'].flatMap(kind =>
      [-1, 0.5, 1, '0', null, undefined, NaN, Infinity].map(value => [
        kind,
        value
      ])
    )
  )('rejects %s platform reference %s', (kind, index) => {
    expect(() =>
      new LDtkLoader().convertLevel(
        source(entity(kind, [field('PlatformIndex', index)]))
      )
    ).toThrow();
  });

  it.each(['Enemy', 'Boss'])('rejects %s without a patrol platform', kind => {
    const input = source(entity(kind));
    input.layerInstances[1].intGridCsv.fill(0);
    expect(() => new LDtkLoader().convertLevel(input)).toThrow();
  });

  it.each([
    [[], 2],
    [[field('Speed', 0)], 0],
    [[field('Speed', 4)], 4]
  ])(
    'keeps defaulted or explicit speed through conversion and patrol: %j',
    (fields, speed) => {
      const level = new LDtkLoader().convertLevel(
        source(entity('Enemy', fields))
      );
      const enemy = new Enemy(level.enemies[0]);
      expect(enemy.speed).toBe(speed);
      expect(enemy.platformIndex).toBe(0);
      enemy.update(level.platforms, 16);
      expect(enemy.x).toBe(35 + speed);
      expect(Number.isFinite(enemy.x)).toBe(true);
      if (speed > 0) {
        enemy.x = 100;
        enemy.update(level.platforms, 16);
        expect(enemy.x).toBe(128 - enemy.width);
        expect(enemy.direction).toBe(-1);
      }
    }
  );

  it.each(['Player', 'Boss', 'Portal'])(
    'rejects an invalid %s even when a later entity would replace it',
    kind => {
      const input = source(entity(kind));
      input.layerInstances[0].entityInstances.unshift({
        ...entity(kind),
        px: [null, 0]
      });
      expect(() => new LDtkLoader().convertLevel(input)).toThrow();
    }
  );

  it('uses the boss default reference after platform geometry is built', () => {
    expect(new LDtkLoader().convertLevel(source(entity('Boss'))).boss).toEqual({
      x: 35,
      y: 0,
      platformIndex: 0
    });
  });
});
