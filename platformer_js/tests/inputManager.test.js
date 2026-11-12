import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { InputManager } from '../src/systems/InputManager.js';

describe('Input Manager', () => {
  let inputManager;

  beforeEach(() => {
    inputManager = new InputManager();
  });

  afterEach(() => {
    inputManager.dispose();
  });

  describe('Key bindings', () => {
    it('should have default bindings', () => {
      expect(inputManager.keyBindings.get('ArrowLeft')).toBe('moveLeft');
      expect(inputManager.keyBindings.get('ArrowRight')).toBe('moveRight');
      expect(inputManager.keyBindings.get('ArrowUp')).toBe('jump');
      expect(inputManager.keyBindings.get(' ')).toBe('shoot');
      expect(inputManager.keyBindings.get('Escape')).toBe('pause');
    });

    it('should bind new keys', () => {
      inputManager.keyBindings.set('w', 'jump');
      const jump = vi.fn();
      inputManager.on('jump:down', jump);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      expect(jump).toHaveBeenCalledTimes(1);
    });

    it('should unbind keys', () => {
      inputManager.keyBindings.delete('ArrowUp');
      const jump = vi.fn();
      inputManager.on('jump:down', jump);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(jump).not.toHaveBeenCalled();
    });
  });

  describe('Key state tracking', () => {
    it('should track key down state', () => {
      const event = { key: 'ArrowLeft' };
      inputManager.handleKeyDown(event);

      expect(inputManager.isKeyPressed('ArrowLeft')).toBe(true);
      expect(inputManager.keys['ArrowLeft']).toBe(true);
    });

    it('should track key up state', () => {
      const downEvent = { key: 'ArrowRight' };
      const upEvent = { key: 'ArrowRight' };

      inputManager.handleKeyDown(downEvent);
      expect(inputManager.isKeyPressed('ArrowRight')).toBe(true);

      inputManager.handleKeyUp(upEvent);
      expect(inputManager.isKeyPressed('ArrowRight')).toBe(false);
    });

    it('should reset all keys', () => {
      inputManager.keys = {
        ArrowLeft: true,
        ArrowRight: true,
        ' ': true
      };

      inputManager.reset();

      expect(inputManager.keys).toEqual({});
    });
  });

  describe('Action detection', () => {
    it('should detect active actions', () => {
      inputManager.handleKeyDown({ key: 'ArrowLeft' });
      expect(inputManager.isActionActive('moveLeft')).toBe(true);
      expect(inputManager.isActionActive('moveRight')).toBe(false);
    });

    it('should detect multiple keys for same action', () => {
      inputManager.keyBindings.set('a', 'moveLeft');

      inputManager.handleKeyDown({ key: 'a' });
      expect(inputManager.isActionActive('moveLeft')).toBe(true);

      inputManager.handleKeyUp({ key: 'a' });
      inputManager.handleKeyDown({ key: 'ArrowLeft' });
      expect(inputManager.isActionActive('moveLeft')).toBe(true);
    });
  });

  describe('Event listeners', () => {
    it('delivers a key edge to all subscribers when the first removes itself', () => {
      const first = vi.fn(() => inputManager.off('shoot:down', first));
      const second = vi.fn();
      inputManager.on('shoot:down', first);
      inputManager.on('shoot:down', second);
      inputManager.off('shoot:down', vi.fn());
      inputManager.off('unrelated:down', second);
      const press = () =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      press();
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      press();
      expect(second).toHaveBeenCalledTimes(1);
      document.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
      press();
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(2);
    });

    it('should register and trigger action listeners', () => {
      const callback = vi.fn();
      inputManager.on('jump:down', callback);

      inputManager.handleKeyDown({ key: 'ArrowUp' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not trigger listener on repeated keydown', () => {
      const callback = vi.fn();
      inputManager.on('shoot:down', callback);

      inputManager.handleKeyDown({ key: ' ' });
      inputManager.handleKeyDown({ key: ' ' }); // Repeated

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should trigger up event', () => {
      const downCallback = vi.fn();
      const upCallback = vi.fn();

      inputManager.on('jump:down', downCallback);
      inputManager.on('jump:up', upCallback);

      inputManager.handleKeyDown({ key: 'ArrowUp' });
      expect(downCallback).toHaveBeenCalledTimes(1);
      expect(upCallback).toHaveBeenCalledTimes(0);

      inputManager.handleKeyUp({ key: 'ArrowUp' });
      expect(upCallback).toHaveBeenCalledTimes(1);
    });

    it('should remove listeners', () => {
      const callback = vi.fn();
      inputManager.on('shoot:down', callback);
      inputManager.off('shoot:down', callback);

      inputManager.handleKeyDown({ key: ' ' });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Enable/Disable', () => {
    it('should ignore input when disabled', () => {
      inputManager.disable();

      inputManager.handleKeyDown({ key: 'ArrowLeft' });
      expect(inputManager.isKeyPressed('ArrowLeft')).toBe(false);
    });

    it('should clear keys when disabled', () => {
      inputManager.handleKeyDown({ key: 'ArrowRight' });
      inputManager.handleKeyDown({ key: ' ' });

      inputManager.disable();

      expect(inputManager.keys).toEqual({});
    });

    it('should accept input when re-enabled', () => {
      inputManager.disable();
      inputManager.enable();

      inputManager.handleKeyDown({ key: 'ArrowUp' });
      expect(inputManager.isKeyPressed('ArrowUp')).toBe(true);
    });
  });
});
