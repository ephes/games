import { describe, it, expect, beforeEach, vi } from 'vitest';

// Input Manager that would be extracted from the game
class InputManager {
  constructor() {
    this.keys = {};
    this.keyBindings = new Map();
    this.listeners = new Map();
    this.enabled = true;

    this.setupDefaultBindings();
  }

  setupDefaultBindings() {
    this.keyBindings.set('ArrowLeft', 'moveLeft');
    this.keyBindings.set('ArrowRight', 'moveRight');
    this.keyBindings.set('ArrowUp', 'jump');
    this.keyBindings.set(' ', 'shoot');
    this.keyBindings.set('Space', 'shoot'); // Alternative
    this.keyBindings.set('Escape', 'pause');
  }

  bindKey(key, action) {
    this.keyBindings.set(key, action);
  }

  unbindKey(key) {
    this.keyBindings.delete(key);
  }

  on(action, callback) {
    if (!this.listeners.has(action)) {
      this.listeners.set(action, []);
    }
    this.listeners.get(action).push(callback);
  }

  off(action, callback) {
    if (this.listeners.has(action)) {
      const callbacks = this.listeners.get(action);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  handleKeyDown(event) {
    if (!this.enabled) {
      return;
    }

    const key = event.key;
    const wasPressed = this.keys[key];
    this.keys[key] = true;

    const action = this.keyBindings.get(key);
    if (action && !wasPressed) {
      this.triggerAction(action, 'down');
    }
  }

  handleKeyUp(event) {
    if (!this.enabled) {
      return;
    }

    const key = event.key;
    this.keys[key] = false;

    const action = this.keyBindings.get(key);
    if (action) {
      this.triggerAction(action, 'up');
    }
  }

  triggerAction(action, type) {
    const actionKey = `${action}:${type}`;
    if (this.listeners.has(actionKey)) {
      this.listeners.get(actionKey).forEach(callback => callback());
    }
  }

  isKeyPressed(key) {
    return !!this.keys[key];
  }

  isActionActive(action) {
    for (const [key, boundAction] of this.keyBindings) {
      if (boundAction === action && this.keys[key]) {
        return true;
      }
    }
    return false;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    this.keys = {};
  }

  reset() {
    this.keys = {};
  }
}

describe('Input Manager', () => {
  let inputManager;

  beforeEach(() => {
    inputManager = new InputManager();
  });

  describe('Key bindings', () => {
    it('should have default bindings', () => {
      expect(inputManager.keyBindings.get('ArrowLeft')).toBe('moveLeft');
      expect(inputManager.keyBindings.get('ArrowRight')).toBe('moveRight');
      expect(inputManager.keyBindings.get('ArrowUp')).toBe('jump');
      expect(inputManager.keyBindings.get(' ')).toBe('shoot');
    });

    it('should bind new keys', () => {
      inputManager.bindKey('w', 'jump');
      expect(inputManager.keyBindings.get('w')).toBe('jump');
    });

    it('should unbind keys', () => {
      inputManager.unbindKey('ArrowUp');
      expect(inputManager.keyBindings.has('ArrowUp')).toBe(false);
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
      inputManager.bindKey('a', 'moveLeft');

      inputManager.handleKeyDown({ key: 'a' });
      expect(inputManager.isActionActive('moveLeft')).toBe(true);

      inputManager.handleKeyUp({ key: 'a' });
      inputManager.handleKeyDown({ key: 'ArrowLeft' });
      expect(inputManager.isActionActive('moveLeft')).toBe(true);
    });
  });

  describe('Event listeners', () => {
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
