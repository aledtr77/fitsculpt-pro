// The plumbing shared by the booking dialog and the mobile drawer. Both of its
// jobs fail in the same way: silently, and only when the two overlays overlap.
//
// The module keeps a counter at module scope, so each test gets its own copy of
// it — otherwise a test that leaves the page locked decides the outcome of the
// next one.

import { beforeEach, describe, expect, it, vi } from 'vitest';

let overlay;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  overlay = await import('../src/scripts/overlay.js');
});

describe('scroll lock', () => {
  it('freezes the page behind the overlay', () => {
    overlay.lockScroll();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('gives the page back when the last overlay closes', () => {
    overlay.lockScroll();
    overlay.unlockScroll();
    expect(document.body.style.overflow).toBe('');
  });

  // The reason the counter exists. The drawer and the dialog can be open at
  // once — a CTA inside the drawer opens the dialog — and a plain
  // `overflow = ''` on whichever closed first unfroze the page underneath the
  // one still covering it, leaving the visitor scrolling the content behind a
  // full-screen panel.
  it('stays frozen while a second overlay is still open', () => {
    overlay.lockScroll();
    overlay.lockScroll();
    overlay.unlockScroll();
    expect(document.body.style.overflow).toBe('hidden');

    overlay.unlockScroll();
    expect(document.body.style.overflow).toBe('');
  });

  // An unmatched unlock must not push the counter below zero: the next open
  // would then need two closes to release the page, and nothing on screen
  // would ever provide the second one.
  it('ignores an unlock that matches nothing', () => {
    overlay.unlockScroll();
    overlay.lockScroll();
    expect(document.body.style.overflow).toBe('hidden');

    overlay.unlockScroll();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores the page rather than hardcoding a scroll style', () => {
    document.body.style.overflow = '';
    overlay.lockScroll();
    overlay.unlockScroll();
    expect(document.body.getAttribute('style')).not.toContain('overflow: hidden');
  });
});

describe('tab trap', () => {
  function panel(markup) {
    document.body.innerHTML = `<div id="panel">${markup}</div>`;
    return document.getElementById('panel');
  }

  function tab(root, { shift = false } = {}) {
    const event = new window.KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    });
    overlay.trapTab(root, event);
    return event;
  }

  const markup = `
    <button id="first">Close</button>
    <input id="middle">
    <button id="last">Send</button>
  `;

  it('wraps from the last control back to the first', () => {
    const root = panel(markup);
    document.getElementById('last').focus();

    const event = tab(root);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('first');
  });

  it('wraps backwards from the first control to the last', () => {
    const root = panel(markup);
    document.getElementById('first').focus();

    const event = tab(root, { shift: true });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('last');
  });

  // Only the two ends are the trap's business. Anywhere else the browser's own
  // tab order is already correct, and preventing it would break it.
  it('leaves the browser to move between the controls in between', () => {
    const root = panel(markup);
    document.getElementById('middle').focus();

    expect(tab(root).defaultPrevented).toBe(false);
    expect(tab(root, { shift: true }).defaultPrevented).toBe(false);
    expect(document.activeElement.id).toBe('middle');
  });

  it('ignores every key that is not Tab', () => {
    const root = panel(markup);
    document.getElementById('last').focus();

    const event = new window.KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    overlay.trapTab(root, event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement.id).toBe('last');
  });

  // A panel with nothing to focus would otherwise trap the keyboard on an
  // element that does not exist, and the visitor could not tab out of it.
  it('does not trap a panel with nothing focusable in it', () => {
    const root = panel('<p>Thanks — we will be in touch.</p>');
    expect(() => tab(root)).not.toThrow();
    expect(tab(root).defaultPrevented).toBe(false);
  });

  // The ends of the trap are decided by the FOCUSABLE selector, so anything it
  // wrongly includes becomes a stop the keyboard cannot leave.
  it('skips controls the keyboard cannot reach', () => {
    const root = panel(`
      <button id="first">Close</button>
      <button id="off" disabled>Submit</button>
      <div id="skipped" tabindex="-1">not a stop</div>
      <button id="last">Send</button>
    `);

    const reachable = [...root.querySelectorAll(overlay.FOCUSABLE)].map((el) => el.id);
    expect(reachable).toEqual(['first', 'last']);

    document.getElementById('last').focus();
    tab(root);
    expect(document.activeElement.id).toBe('first');
  });

  it('treats a single control as both ends', () => {
    const root = panel('<button id="only">Close</button>');
    document.getElementById('only').focus();

    expect(tab(root).defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('only');
  });
});
