import { describe, expect, it } from 'vitest';
import { LDtkLoader } from '../src/systems/LDtkLoader.js';

describe('LDtk collision mesh', () => {
  it.each([
    ['empty grid', 16, 0, 0, [], []],
    ['no solid cells', 16, 3, 1, [0, 2, 0], []],
    [
      'adjacent cells',
      16,
      3,
      1,
      [1, 1, 1],
      [{ x: 0, y: 0, width: 48, height: 16 }]
    ],
    [
      'gap between runs',
      10,
      5,
      1,
      [1, 1, 0, 1, 1],
      [
        { x: 0, y: 0, width: 20, height: 10 },
        { x: 30, y: 0, width: 20, height: 10 }
      ]
    ],
    [
      'consecutive full rows',
      8,
      2,
      2,
      [1, 1, 1, 1],
      [
        { x: 0, y: 0, width: 16, height: 8 },
        { x: 0, y: 8, width: 16, height: 8 }
      ]
    ],
    [
      'last cell and next row first cell',
      12,
      3,
      2,
      [0, 0, 1, 1, 0, 0],
      [
        { x: 24, y: 0, width: 12, height: 12 },
        { x: 0, y: 12, width: 12, height: 12 }
      ]
    ]
  ])(
    'converts %s to explicit rectangles',
    (_name, size, width, height, cells, expected) => {
      const loader = new LDtkLoader();
      const level = { platforms: [] };
      loader.processPlatforms(
        {
          __gridSize: size,
          __cWid: width,
          __cHei: height,
          intGridCsv: cells
        },
        level
      );
      expect(level.platforms).toEqual(expected);
    }
  );

  it('sorts shuffled rectangles and merges only matching horizontal neighbors', () => {
    const loader = new LDtkLoader();
    expect(
      loader.mergePlatforms([
        { x: 20, y: 20, width: 10, height: 10 },
        { x: 40, y: 0, width: 10, height: 20 },
        { x: 10, y: 0, width: 10, height: 10 },
        { x: 0, y: 20, width: 20, height: 10 },
        { x: 30, y: 0, width: 10, height: 10 },
        { x: 0, y: 0, width: 10, height: 10 }
      ])
    ).toEqual([
      { x: 0, y: 0, width: 20, height: 10 },
      { x: 30, y: 0, width: 10, height: 10 },
      { x: 40, y: 0, width: 10, height: 20 },
      { x: 0, y: 20, width: 30, height: 10 }
    ]);
    expect(loader.mergePlatforms([])).toEqual([]);
  });
});
