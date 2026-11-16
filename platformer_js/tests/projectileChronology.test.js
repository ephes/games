import { afterEach, beforeEach, expect, it } from 'vitest';
import { Game } from '../src/Game.js';
import { Enemy } from '../src/entities/Enemy.js';
import { Projectile } from '../src/entities/Projectile.js';

let game;
beforeEach(() => {
  document.body.innerHTML = '<canvas id="chronology"></canvas>';
  game = new Game('chronology');
  game.createLevel();
  game.boss.x = 2000;
});
afterEach(() => game.dispose());

// Independent horizontal interval oracle for these vertically overlapping
// fixtures: enumerate every contact, then retire shots/targets chronologically.
function chronologicalOracle(shots, targets) {
  const events = [];
  for (const shot of shots) {
    for (const target of targets) {
      const motion = shot.speed * shot.direction - (target.x - target.startX);
      const gap = target.startX - shot.x;
      const time =
        motion > 0
          ? (gap - shot.width) / motion
          : (gap + target.width) / motion;
      if (time >= 0 && time <= 1) {
        events.push({ shot, target, time });
      }
    }
  }
  events.sort((a, b) => a.time - b.time || a.shot.x - b.shot.x);
  const consumed = new Set();
  const defeated = new Set();
  for (const { shot, target } of events) {
    if (!consumed.has(shot.name) && !defeated.has(target.name)) {
      consumed.add(shot.name);
      defeated.add(target.name);
    }
  }
  return {
    score: defeated.size * 50,
    targets: targets.filter(t => !defeated.has(t.name)).map(t => t.name),
    shots: shots.filter(s => !consumed.has(s.name)).map(s => s.name)
  };
}

function expectChronologicalOutcome(shots, targets) {
  const expected = chronologicalOracle(shots, targets);
  for (const reverseShots of [false, true]) {
    for (const reverseTargets of [false, true]) {
      const enemies = targets.map(t =>
        Object.assign(new Enemy({ x: t.x, y: 100, speed: 0 }), {
          name: t.name,
          width: t.width
        })
      );
      const previous = new Map(
        enemies.map((e, i) => [e, { x: targets[i].startX, y: e.y }])
      );
      const projectiles = shots.map(s =>
        Object.assign(new Projectile(s.x, s.y, s.direction), {
          name: s.name,
          speed: s.speed
        })
      );
      game.enemies = reverseTargets ? [...enemies].reverse() : enemies;
      game.projectiles = reverseShots
        ? [...projectiles].reverse()
        : projectiles;
      game.score = 0;
      game.updateProjectiles(16, previous);
      expect({
        score: game.score,
        targets: enemies.filter(e => e.alive).map(e => e.name),
        shots: projectiles
          .filter(s => game.projectiles.includes(s))
          .map(s => s.name)
      }).toEqual(expected);
    }
  }
}

it.each([
  ['long shot first', 30, 30, 50],
  ['short shot first', 40, 20, 50],
  ['moving target', 60, 20, 80],
  ['equal-time opposing shots', 100, -150, 50]
])(
  'resolves %s independently of shot/target storage order',
  (_, x, speed, startX) => {
    expect.assertions(4);
    const shots = [
      { name: 'long', x: 0, y: 110, width: 10, speed: 150, direction: 1 },
      {
        name: 'short',
        x,
        y: 110,
        width: 10,
        speed: Math.abs(speed),
        direction: Math.sign(speed)
      }
    ];
    // For the tie case both shots first reach the near target at 4/15.
    const targets = [
      { name: 'near', x: 50, startX, width: 10 },
      { name: 'far', x: 120, startX: 120, width: 10 }
    ];
    expectChronologicalOutcome(shots, targets);
  }
);

it('reinserts a replacement contact behind another earlier pending impact', () => {
  expect.assertions(4);
  const shots = [
    { name: 'long', x: 0, y: 110, width: 10, speed: 200, direction: 1 },
    { name: 'early', x: 40, y: 110, width: 10, speed: 10, direction: 1 },
    { name: 'middle', x: 70, y: 110, width: 10, speed: 50, direction: 1 }
  ];
  const targets = [50, 100, 150].map(x => ({
    name: String(x),
    x,
    startX: x,
    width: 10
  }));
  expectChronologicalOutcome(shots, targets);
});

it.each([false, true])(
  'rechecks a defeated boss without repeating its award (reverse: %s)',
  reverse => {
    game.boss.x = 50;
    game.boss.y = 100;
    game.boss.width = 10;
    game.boss.health = 1;
    const enemy = new Enemy({ x: 100, y: 100, speed: 0 });
    game.enemies = [enemy];
    const early = new Projectile(40, 110, 1);
    const later = new Projectile(0, 110, 1);
    later.speed = 200;
    const spare = new Projectile(0, 110, 1);
    spare.speed = 150;
    game.projectiles = reverse ? [spare, later, early] : [early, later, spare];
    game.updateProjectiles(16);
    expect(game.score).toBe(250);
    expect(game.boss.health).toBe(0);
    expect(enemy.alive).toBe(false);
    expect(game.portal.isLocked).toBe(false);
    expect(game.projectiles).toEqual([spare]);
    game.updateProjectiles(16);
    expect(game.score).toBe(250);
  }
);
