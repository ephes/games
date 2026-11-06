import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/systems/InputManager.js';
import { Game } from '../src/Game.js';

// Exercise real DOM listeners rather than the legacy test-only input class.
describe('Keyboard focus lifecycle', () => {
  let input;
  beforeEach(() => {
    input = new InputManager();
  });
  afterEach(() => {
    input.dispose?.();
    vi.restoreAllMocks();
  });

  it.each(['blur', 'hidden'])(
    'clears held movement and shooting on %s',
    loss => {
      for (const key of ['ArrowRight', ' ']) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
      expect(input.isActionActive('moveRight')).toBe(true);
      expect(input.isActionActive('shoot')).toBe(true);
      if (loss === 'blur') {
        window.dispatchEvent(new Event('blur'));
      } else {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
      }
      window.dispatchEvent(new Event('focus'));
      expect(input.getKeys()).toEqual({});
      expect(input.isActionActive('moveRight')).toBe(false);
      expect(input.isActionActive('shoot')).toBe(false);
    }
  );

  it('keeps visible input and suppresses repeats until release or focus loss', () => {
    const shoot = vi.fn();
    input.on('shoot:down', shoot);
    const press = () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    press();
    press();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(input.isActionActive('shoot')).toBe(true);
    expect(shoot).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
    press();
    window.dispatchEvent(new Event('blur'));
    press();
    expect(shoot).toHaveBeenCalledTimes(3);
  });

  it('removes all DOM listeners when disposed and allows a replacement', () => {
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const shoot = vi.fn();
    input.on('shoot:down', shoot);
    input.dispose();
    input.dispose();
    for (const type of ['keydown', 'keyup', 'visibilitychange']) {
      expect(documentRemove).toHaveBeenCalledWith(type, expect.any(Function));
    }
    expect(windowRemove).toHaveBeenCalledWith('blur', expect.any(Function));
    const old = input;
    input = new InputManager();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    expect(old.getKeys()).toEqual({});
    expect(shoot).not.toHaveBeenCalled();
    expect(input.isActionActive('shoot')).toBe(true);
  });

  it('disposes input and cancels the game animation when the game is disposed', () => {
    document.body.innerHTML = '<canvas id="test-game"></canvas>';
    const game = new Game('test-game');
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    game.animationFrameId = 123;
    game.dispose();
    expect(cancel).toHaveBeenCalledWith(123);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(game.inputManager.getKeys()).toEqual({});
  });
});
