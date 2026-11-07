import { describe, expect, it } from 'vitest';
import { LDtkLoader } from '../src/systems/LDtkLoader.js';

describe('LDtk collision mesh', () => {
  it.each([
    ['empty grid', 16, 1, 1, [0], []],
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

describe('LDtk IntGrid validation', () => {
  const grid = overrides => ({
    __gridSize: 16,
    __cWid: 2,
    __cHei: 2,
    intGridCsv: [1, 1, 0, 0],
    ...overrides
  });

  it.each([
    { __cWid: -1 },
    { __cHei: 0 },
    { __cWid: 1.5 },
    { __cHei: 2.5 },
    { __cWid: NaN },
    { __cHei: null },
    { __cWid: '2' },
    { __gridSize: 0 },
    { __gridSize: -16 },
    { __gridSize: 1.5 },
    { __gridSize: Infinity },
    { __gridSize: Number.MAX_SAFE_INTEGER },
    { intGridCsv: [1] },
    { intGridCsv: [1, 1, 0, 0, 0] },
    { intGridCsv: null },
    { intGridCsv: '1100' }
  ])('rejects malformed grid %j without changing geometry', overrides => {
    const loader = new LDtkLoader();
    const platforms = [{ x: 0, y: 20, width: 100, height: 10 }];
    const level = { platforms };
    expect(() => loader.processPlatforms(grid(overrides), level)).toThrow(
      'Invalid LDtk IntGrid'
    );
    expect(level.platforms).toBe(platforms);
  });

  it.each([1_000_001, Number.MAX_SAFE_INTEGER, Infinity])(
    'refuses width %s before reading any cells',
    width => {
      // A premature scan fails immediately, even for an unbounded dimension.
      const cells = [0];
      for (const index of ['0', 'NaN']) {
        Object.defineProperty(cells, index, {
          get() {
            throw new Error('Unexpected cell read');
          }
        });
      }
      expect(() =>
        new LDtkLoader().processPlatforms(
          grid({
            __cWid: width,
            __cHei: 1,
            intGridCsv: cells
          }),
          { platforms: [] }
        )
      ).toThrow('Invalid LDtk IntGrid');
    }
  );

  it('accepts the cell budget boundary and rejects one cell more', () => {
    const loader = new LDtkLoader();
    const level = { platforms: [] };
    loader.processPlatforms(
      grid({
        __cWid: 1_000_000,
        __cHei: 1,
        intGridCsv: Array(1_000_000).fill(0)
      }),
      level
    );
    expect(level.platforms).toEqual([]);
    expect(() =>
      loader.processPlatforms(
        grid({
          __cWid: 1_000_001,
          __cHei: 1,
          intGridCsv: Array(1_000_001).fill(0)
        }),
        level
      )
    ).toThrow('Invalid LDtk IntGrid');
  });
});
