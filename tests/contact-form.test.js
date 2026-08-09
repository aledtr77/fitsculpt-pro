// The contact section at the bottom of the landing page. The template ships
// without a backend, and the whole point of this module is that the form must
// not be allowed to fall through to the browser's default.

import { beforeEach, describe, expect, it } from 'vitest';
import { initContactForm } from '../src/scripts/contact-form.js';

function render({ name = 'Sarah' } = {}) {
  document.body.innerHTML = `
    <form id="pageContactForm">
      <input type="text" id="contactName" value="${name}">
      <input type="email" id="contactEmail" value="sarah@example.com">
      <textarea id="contactMessage">I would like to know more.</textarea>
      <button type="submit">Send</button>
    </form>
  `;
  initContactForm();
  return document.getElementById('pageContactForm');
}

function submit(form) {
  const event = new window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('submitting', () => {
  // A form with no action and no method does a GET to the current URL. The page
  // reloaded, and the visitor's name, email and message came back in the query
  // string — written into history, into the referrer, and into any logs along
  // the way.
  it('never lets the browser submit the form', () => {
    expect(submit(render()).defaultPrevented).toBe(true);
  });

  it('confirms in place', () => {
    submit(render());

    expect(document.getElementById('pageContactForm')).toBeNull();
    expect(document.querySelector('.form-success h3').textContent).toBe('Message sent');
  });

  it('greets the visitor by name', () => {
    submit(render({ name: '  Sarah Jenkins  ' }));

    expect(document.querySelector('.form-success p').textContent)
      .toBe("Thanks Sarah Jenkins — Coach Elena's team will reply within 24 hours.");
  });

  // The name field is not required by this module, and a blank one would
  // otherwise produce "Thanks  — Coach Elena's team…".
  it.each([
    ['blank', ''],
    ['whitespace only', '   '],
  ])('falls back to a neutral greeting when the name is %s', (_, name) => {
    submit(render({ name }));

    expect(document.querySelector('.form-success p').textContent)
      .toBe("Thanks there — Coach Elena's team will reply within 24 hours.");
  });

  it('falls back when the form has no name field at all', () => {
    document.body.innerHTML = `
      <form id="pageContactForm">
        <input type="email" id="contactEmail" value="sarah@example.com">
      </form>
    `;
    initContactForm();

    expect(() => submit(document.getElementById('pageContactForm'))).not.toThrow();
    expect(document.querySelector('.form-success p').textContent).toContain('Thanks there');
  });
});

describe('sending another one', () => {
  it('offers the form back', () => {
    const form = render();
    submit(form);

    document.querySelector('.form-success button').click();

    expect(document.getElementById('pageContactForm')).toBe(form);
  });

  it('clears the previous message', () => {
    const form = render();
    document.getElementById('contactMessage').value = 'Sent already';
    submit(form);

    document.querySelector('.form-success button').click();

    expect(document.getElementById('contactMessage').value).toBe('I would like to know more.');
  });
});

describe('pages without the form', () => {
  it('does nothing rather than throwing', () => {
    document.body.innerHTML = '<main><h1>Privacy</h1></main>';
    expect(() => initContactForm()).not.toThrow();
  });
});
