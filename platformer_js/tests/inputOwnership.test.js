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
    canvas.blur();
    expect(input.getKeys()).toEqual({});
    canvas.focus();
    press(canvas);
    document.querySelector('button').focus();
    expect(input.getKeys()).toEqual({});
    expect(press(document.body).defaultPrevented).toBe(false);
  });
  it.each([
    ['ctrlKey', { ctrlKey: true }],
    ['metaKey', { metaKey: true }],
    ['altKey', { altKey: true }],
    ['isComposing', { isComposing: true }],
    ['prevented', {}]
  ])('releases a held key on keyup even with %s', (_name, options) => {
    document.body.innerHTML = '<canvas tabindex="0"></canvas>';
    const canvas = document.querySelector('canvas');
    input = new InputManager(canvas);
    const up = vi.fn();
    input.on('moveRight:up', up);
    canvas.focus();
    press(canvas, { key: 'ArrowRight' });
    expect(input.isActionActive('moveRight')).toBe(true);
    const release = new KeyboardEvent('keyup', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
      ...options
    });
    if (_name === 'prevented') {
      release.preventDefault();
    }
    canvas.dispatchEvent(release);
    expect(input.isActionActive('moveRight')).toBe(false);
    expect(up).toHaveBeenCalledTimes(1);
    // A modified keyup of a key that is not held stays ignored.
    const stray = vi.fn();
    input.on('moveLeft:up', stray);
    canvas.dispatchEvent(
      new KeyboardEvent('keyup', {
        key: 'ArrowLeft',
        bubbles: true,
        ctrlKey: true
      })
    );
    expect(stray).not.toHaveBeenCalled();
  });
});
