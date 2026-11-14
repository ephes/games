import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/systems/InputManager.js';

let input;
afterEach(() => {
  input?.dispose();
  document.body.innerHTML = '';
});

function press(target, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key: ' ',
    bubbles: true,
    cancelable: true,
    ...options
  });
  target.dispatchEvent(event);
  return event;
}

describe('Keyboard admission', () => {
  it.each(['input', 'textarea', 'select', 'div contenteditable="true"'])(
    'ignores editing in %s and releases held keys on focus',
    tag => {
      document.body.innerHTML = `<${tag}></${tag.split(' ')[0]}>`;
      input = new InputManager();
      const shoot = vi.fn();
      input.on('shoot:down', shoot);
      input.handleKeyDown({ key: 'ArrowRight' });
      const editor = document.body.firstElementChild;
      editor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(input.getKeys()).toEqual({});
      expect(press(editor).defaultPrevented).toBe(false);
      expect(shoot).not.toHaveBeenCalled();
    }
  );
  it.each(['composing', 'owned'])(
    'ignores %s events before key mutation',
    kind => {
      input = new InputManager();
      const shoot = vi.fn();
      input.on('shoot:down', shoot);
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        cancelable: true,
        isComposing: kind === 'composing'
      });
      if (kind === 'owned') {
        event.preventDefault();
      }
      document.dispatchEvent(event);
      expect(shoot).not.toHaveBeenCalled();
      expect(input.getKeys()).toEqual({});
    }
  );
  it('requires surface focus and cancels only handled unmodified keys', () => {
    document.body.innerHTML =
      '<canvas tabindex="0"></canvas><button>Next</button>';
    const canvas = document.querySelector('canvas');
    input = new InputManager(canvas);
    expect(press(document).defaultPrevented).toBe(false);
    expect(input.getKeys()).toEqual({});
    canvas.focus();
    expect(press(canvas).defaultPrevented).toBe(true);
    expect(input.isActionActive('shoot')).toBe(true);
    expect(press(canvas, { key: 'Tab' }).defaultPrevented).toBe(false);
    expect(
      press(canvas, { key: 'ArrowLeft', ctrlKey: true }).defaultPrevented
    ).toBe(false);
    document.querySelector('button').focus();
    expect(input.getKeys()).toEqual({});
    expect(press(document.body).defaultPrevented).toBe(false);
  });
});
