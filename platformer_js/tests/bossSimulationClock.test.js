import { afterEach, expect, it, vi } from 'vitest';
import { Boss } from '../src/entities/Boss.js';
import { Renderer } from '../src/rendering/Renderer.js';
const boss = () => new Boss({ x: 100, y: 100, speed: 0 });
afterEach(() => vi.restoreAllMocks());

it('advances boss frames and expires hit state despite wall-clock jumps', () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const target = boss();
  target.takeDamage();
  now.mockReturnValue(-1_000_000);
  target.update([], 200);
  expect(target.frameX).toBe(1);
  expect(target.isHit).toBe(true);
  now.mockReturnValue(1_000_000_000);
  target.update([], 199);
  expect(target.frameX).toBe(1);
  expect(target.isHit).toBe(true);
  target.update([], 1);
  expect(target.frameX).toBe(2);
  expect(target.isHit).toBe(false);
});

it('carries frame remainders and renews hit expiry across split steps', () => {
  const whole = boss(),
    split = boss();
  whole.update([], 750);
  for (let i = 0; i < 45; i++) {
    split.update([], 1000 / 60);
  }
  expect(whole.frameX).toBe(3);
  expect(split.frameX).toBe(whole.frameX);
  for (const target of [whole, split]) {
    target.takeDamage();
    target.update([], 300);
    target.takeDamage();
    target.update([], 399);
    expect(target.isHit).toBe(true);
    target.update([], 1);
    expect(target.isHit).toBe(false);
  }
  expect(split.frameX).toBe(whole.frameX);
});

it('renders hit fading from the same simulation clock', () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const target = boss();
  target.takeDamage();
  target.update([], 200);
  now.mockReturnValue(-1_000_000);
  const styles = [];
  const ctx = {
    save() {},
    restore() {},
    drawImage() {},
    fillRect() {
      styles.push(this.fillStyle);
    }
  };
  const renderer = new Renderer(
    { getContext: () => ctx },
    {
      getAnimationConfig: () => ({ boss: { frameWidth: 64, frameHeight: 80 } }),
      getSprite: () => ({})
    }
  );
  renderer.drawBoss(target);
  expect(styles[0]).toBe('rgba(255, 100, 100, 0.3)');
});
