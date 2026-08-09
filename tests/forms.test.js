// The confirmation panel that stands in for a form after it is submitted. Two
// things here are load-bearing and neither is visible when it breaks: visitor
// text must arrive as text, and the form must survive being replaced.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showFormSuccess } from '../src/scripts/forms.js';

function render() {
  document.body.innerHTML = `
    <div id="host">
      <form id="contact">
        <input id="name" value="Sarah">
        <textarea id="message">Hello</textarea>
        <button type="submit">Send</button>
      </form>
    </div>
  `;
  return {
    host: document.getElementById('host'),
    form: document.getElementById('contact'),
  };
}

const defaults = { title: 'Message sent', message: 'We will reply within 24 hours.' };

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the panel', () => {
  it('takes the place of the form', () => {
    const { host, form } = render();
    showFormSuccess(form, defaults);

    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('.form-success')).not.toBeNull();
  });

  // Nothing moves the focus or the viewport on submit, so a screen reader is
  // given no reason to look at the new panel unless it announces itself.
  it('announces itself to assistive technology', () => {
    const { host, form } = render();
    showFormSuccess(form, defaults);

    expect(host.querySelector('.form-success').getAttribute('role')).toBe('status');
  });

  it('shows the title and the message', () => {
    const { host, form } = render();
    showFormSuccess(form, defaults);

    expect(host.querySelector('h3').textContent).toBe('Message sent');
    expect(host.querySelector('p').textContent).toBe('We will reply within 24 hours.');
  });

  // The tick is decoration next to a heading that already says it: read out, it
  // is noise.
  it('hides the tick from the accessibility tree', () => {
    const { host, form } = render();
    showFormSuccess(form, defaults);

    const svg = host.querySelector('.form-success-icon svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});

// The message is built from a name the visitor typed. The panel is assembled
// with createElement and textContent for exactly this reason: the same panel
// built from an innerHTML template would execute what it was handed.
describe('visitor-supplied text', () => {
  const payload = '<img src=x onerror="document.title=\'pwned\'">';

  it('renders markup in the message as characters', () => {
    const { host, form } = render();
    showFormSuccess(form, { ...defaults, message: `Thanks ${payload} — see you soon.` });

    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('p').textContent).toContain(payload);
  });

  it('renders markup in the title as characters', () => {
    const { host, form } = render();
    showFormSuccess(form, { ...defaults, title: payload });

    expect(host.querySelector('h3').querySelector('*')).toBeNull();
    expect(host.querySelector('h3').textContent).toBe(payload);
  });

  it('renders markup in the button label as characters', () => {
    const { host, form } = render();
    showFormSuccess(form, { ...defaults, actionLabel: payload });

    expect(host.querySelector('button').textContent).toBe(payload);
    expect(host.querySelector('button').querySelector('*')).toBeNull();
  });
});

describe('the action button', () => {
  it('is left out when no label is given', () => {
    const { host, form } = render();
    showFormSuccess(form, defaults);

    expect(host.querySelector('.form-success button')).toBeNull();
  });

  // The form the visitor was tabbing through has just left the document. Focus
  // would otherwise fall back to <body> and a keyboard user would start again
  // from the top of the page.
  it('takes the focus when it is there', () => {
    const { form } = render();
    showFormSuccess(form, { ...defaults, actionLabel: 'Send another message' });

    expect(document.activeElement.textContent).toBe('Send another message');
  });

  it('is a plain button, not a second submit', () => {
    const { host, form } = render();
    showFormSuccess(form, { ...defaults, actionLabel: 'Close' });

    expect(host.querySelector('.form-success button').type).toBe('button');
  });

  it('puts the form back and runs the callback', () => {
    const { host, form } = render();
    const onAction = vi.fn();
    showFormSuccess(form, { ...defaults, actionLabel: 'Close', onAction });

    host.querySelector('button').click();

    expect(host.querySelector('form')).toBe(form);
    expect(host.querySelector('.form-success')).toBeNull();
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('puts the form back even with no callback to run', () => {
    const { host, form } = render();
    showFormSuccess(form, { ...defaults, actionLabel: 'Close' });

    expect(() => host.querySelector('button').click()).not.toThrow();
    expect(host.querySelector('form')).toBe(form);
  });
});

// The bug this whole shape exists to avoid: the panel used to be written into
// the form's innerHTML, which destroyed the fields for good. Every later visit
// to the booking dialog found the previous confirmation and no form at all,
// with nothing on screen able to bring it back.
describe('restoring the form', () => {
  it('returns a handle that puts the same form element back', () => {
    const { host, form } = render();
    const restore = showFormSuccess(form, defaults);

    restore();

    expect(host.querySelector('form')).toBe(form);
    expect(host.querySelector('#name')).not.toBeNull();
    expect(host.querySelector('#message')).not.toBeNull();
  });

  it('clears what the last visitor typed', () => {
    const { host, form } = render();
    document.getElementById('name').value = 'Someone else';
    document.getElementById('message').value = 'A different message';

    showFormSuccess(form, defaults)();

    expect(host.querySelector('#name').value).toBe('Sarah');
    expect(host.querySelector('#message').value).toBe('Hello');
  });

  it('can be shown and restored repeatedly', () => {
    const { host, form } = render();

    for (let i = 0; i < 3; i += 1) {
      const restore = showFormSuccess(form, defaults);
      expect(host.querySelector('form')).toBeNull();
      restore();
      expect(host.querySelector('form')).toBe(form);
    }

    expect(host.querySelectorAll('.form-success')).toHaveLength(0);
  });
});
