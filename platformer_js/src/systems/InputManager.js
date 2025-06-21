/**
 * @module systems/InputManager
 */

/**
 * Manages keyboard input for the game
 */
export class InputManager {
  constructor() {
    this.keys = {};
    this.keyBindings = new Map();
    this.listeners = new Map();
    this.enabled = true;

    this.setupDefaultBindings();
    this.setupEventListeners();
  }

  /**
   * Set up default key bindings
   */
  setupDefaultBindings() {
    this.keyBindings.set('ArrowLeft', 'moveLeft');
    this.keyBindings.set('ArrowRight', 'moveRight');
    this.keyBindings.set('ArrowUp', 'jump');
    this.keyBindings.set(' ', 'shoot');
    this.keyBindings.set('Escape', 'pause');
  }

  /**
   * Set up keyboard event listeners
   */
  setupEventListeners() {
    document.addEventListener('keydown', e => this.handleKeyDown(e));
    document.addEventListener('keyup', e => this.handleKeyUp(e));
  }

  /**
   * Handle key down event
   * @param {KeyboardEvent} event - Keyboard event
   */
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

  /**
   * Handle key up event
   * @param {KeyboardEvent} event - Keyboard event
   */
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

  /**
   * Trigger action listeners
   * @param {string} action - Action name
   * @param {string} type - Event type (down/up)
   */
  triggerAction(action, type) {
    const actionKey = `${action}:${type}`;
    if (this.listeners.has(actionKey)) {
      this.listeners.get(actionKey).forEach(callback => callback());
    }
  }

  /**
   * Register action listener
   * @param {string} action - Action to listen for
   * @param {Function} callback - Callback function
   */
  on(action, callback) {
    if (!this.listeners.has(action)) {
      this.listeners.set(action, []);
    }
    this.listeners.get(action).push(callback);
  }

  /**
   * Remove action listener
   * @param {string} action - Action to stop listening for
   * @param {Function} callback - Callback to remove
   */
  off(action, callback) {
    if (this.listeners.has(action)) {
      const callbacks = this.listeners.get(action);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Check if key is currently pressed
   * @param {string} key - Key to check
   * @returns {boolean} True if pressed
   */
  isKeyPressed(key) {
    return !!this.keys[key];
  }

  /**
   * Check if action is active
   * @param {string} action - Action to check
   * @returns {boolean} True if active
   */
  isActionActive(action) {
    for (const [key, boundAction] of this.keyBindings) {
      if (boundAction === action && this.keys[key]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get current key states
   * @returns {Object} Current key states
   */
  getKeys() {
    return this.keys;
  }

  /**
   * Enable input handling
   */
  enable() {
    this.enabled = true;
  }

  /**
   * Disable input handling
   */
  disable() {
    this.enabled = false;
    this.keys = {};
  }

  /**
   * Reset all key states
   */
  reset() {
    this.keys = {};
  }
}
