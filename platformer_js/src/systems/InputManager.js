/**
 * @module systems/InputManager
 */

/**
 * Manages keyboard input for the game
 */
export class InputManager {
  constructor(surface = document) {
    this.surface = surface;
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
    this.onKeyDown = event => this.handleKeyDown(event);
    this.onKeyUp = event => this.handleKeyUp(event);
    this.onBlur = () => this.reset();
    this.onFocusIn = event => {
      if (
        this.isEditable(event) ||
        (this.surface !== document && event.target !== this.surface)
      ) {
        this.reset();
      }
    };
    this.onCompositionStart = () => this.reset();
    this.onVisibilityChange = () => {
      if (document.hidden) {
        this.reset();
      }
    };
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    if (this.surface !== document) {
      this.surface.addEventListener('blur', this.onBlur);
    }
    document.addEventListener('focusin', this.onFocusIn);
    document.addEventListener('compositionstart', this.onCompositionStart);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /**
   * Release DOM and action listeners when this input manager is replaced.
   */
  dispose() {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    if (this.surface !== document) {
      this.surface.removeEventListener('blur', this.onBlur);
    }
    document.removeEventListener('focusin', this.onFocusIn);
    document.removeEventListener('compositionstart', this.onCompositionStart);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.disable();
    this.listeners.clear();
  }

  /**
   * Handle key down event
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    if (!this.accepts(event)) {
      return;
    }

    if (this.surface !== document) {
      event.preventDefault();
    }
    // Reset retires held keys at lifecycle boundaries. Native repeats must not
    // resurrect them or retrigger pause before a fresh physical press.
    if (event.repeat) {
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
    const key = event.key;
    const accepted = this.accepts(event);
    // A held gameplay key is always released on its own surface, even when a
    // modifier is down, the event was prevented or IME composition started;
    // otherwise releasing it during Ctrl/Meta would leave it stuck.
    const releasesHeld =
      this.enabled &&
      this.keys[key] === true &&
      this.keyBindings.has(key) &&
      (this.surface === document || event.target === this.surface);
    if (!accepted && !releasesHeld) {
      return;
    }

    if (accepted && this.surface !== document) {
      event.preventDefault();
    }
    this.keys[key] = false;

    const action = this.keyBindings.get(key);
    if (action) {
      this.triggerAction(action, 'up');
    }
  }

  /** Ignore native editing/IME/shortcut events before touching held state. */
  isEditable(event) {
    const path = event.composedPath?.() ?? [event.target];
    return path.some(node => {
      if (!node?.closest) {
        return false;
      }
      const editable = node.closest('[contenteditable]');
      return (
        !!node.closest('input, textarea, select') ||
        (editable && editable.getAttribute('contenteditable') !== 'false')
      );
    });
  }

  /** Only the focused surface owns gameplay keys; document is a standalone fallback. */
  accepts(event) {
    return (
      this.enabled &&
      !event.defaultPrevented &&
      !event.isComposing &&
      event.keyCode !== 229 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !this.isEditable(event) &&
      this.keyBindings.has(event.key) &&
      (this.surface === document ||
        (document.activeElement === this.surface &&
          event.target === this.surface))
    );
  }

  /**
   * Trigger action listeners
   * @param {string} action - Action name
   * @param {string} type - Event type (down/up)
   */
  triggerAction(action, type) {
    const actionKey = `${action}:${type}`;
    if (this.listeners.has(actionKey)) {
      [...this.listeners.get(actionKey)].forEach(callback => callback());
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
