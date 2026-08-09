// The toggle only. Applying the stored theme is the blocking snippet's job in
// each page's <head> — this module runs after first paint, and setting the
// theme here would flash the wrong one on every load.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initTheme } from '../src/scripts/theme.js';

function render(theme) {
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  document.body.innerHTML = '<button id="themeToggleBtn">theme</button>';
  initTheme();
  return document.getElementById('themeToggleBtn');
}

const themeNow = () => document.documentElement.getAttribute('data-theme');

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the button', () => {
  it('draws an icon over whatever markup the page shipped', () => {
    const button = render('dark');

    expect(button.textContent).toBe('');
    expect(button.querySelectorAll('svg')).toHaveLength(1);
  });

  it('hides the icon from the accessibility tree', () => {
    const button = render('dark');
    expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  // The label is the only thing a screen reader gets, and it announces what the
  // button will do — not what the page currently looks like. "Dark theme" on a
  // button that switches you to dark is ambiguous in the one place where the
  // visual cue is unavailable.
  it('announces the action, not the current state', () => {
    expect(render('light').getAttribute('aria-label')).toBe('Switch to dark theme');

    document.documentElement.setAttribute('data-theme', 'dark');
    expect(render('dark').getAttribute('aria-label')).toBe('Switch to light theme');
  });

  // The path data itself is not asserted — copying it into the test would only
  // restate the source. What has to hold is that the two states do not draw the
  // same thing, which is what a visitor uses to tell them apart.
  it('draws a different icon in each theme', () => {
    const light = render('light').querySelector('path').getAttribute('d');

    document.documentElement.setAttribute('data-theme', 'dark');
    const dark = render('dark').querySelector('path').getAttribute('d');

    expect(light).not.toBe(dark);
  });

  // Icons are replaced, not appended. Accumulating them leaves every previous
  // one in the button, stacked and still painted.
  it('keeps exactly one icon however often it is pressed', () => {
    const button = render('dark');

    for (let i = 0; i < 4; i += 1) button.click();

    expect(button.querySelectorAll('svg')).toHaveLength(1);
  });
});

describe('switching', () => {
  it('flips the theme on the document', () => {
    const button = render('dark');

    button.click();
    expect(themeNow()).toBe('light');

    button.click();
    expect(themeNow()).toBe('dark');
  });

  it('relabels itself for the theme it just switched to', () => {
    const button = render('dark');

    button.click();
    expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
  });

  it('remembers the choice', () => {
    const button = render('dark');

    button.click();
    expect(localStorage.getItem('theme')).toBe('light');

    button.click();
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  // Anything that is not exactly "light" is dark: the blocking snippet writes
  // one of the two, and a stray or truncated value must not leave the toggle
  // unable to decide what it is switching away from.
  it.each([undefined, 'dark', '', 'Light', 'nonsense'])(
    'treats %s as dark and switches to light',
    (value) => {
      const button = render(value);
      button.click();
      expect(themeNow()).toBe('light');
    },
  );
});

describe('when storage refuses', () => {
  // Safari in private mode throws on setItem. Persisting the choice is a
  // nicety; switching the theme is the thing the visitor asked for, and it has
  // to happen either way.
  it('still switches the theme', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    const button = render('dark');

    expect(() => button.click()).not.toThrow();
    expect(themeNow()).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
  });
});

describe('pages without a toggle', () => {
  it('does nothing rather than throwing', () => {
    document.body.innerHTML = '<main><h1>Privacy</h1></main>';
    expect(() => initTheme()).not.toThrow();
  });
});
