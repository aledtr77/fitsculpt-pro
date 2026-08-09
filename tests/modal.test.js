// The booking dialog. It is a plain element rather than <dialog> so that the
// backdrop blur and the scale-in stay under CSS control, which makes focus,
// the scroll lock and the escape routes this module's problem rather than the
// browser's — three things that are correct by default in <dialog> and have to
// be re-earned here.
//
// The module is imported fresh for each test: overlay.js keeps the scroll-lock
// counter at module scope, and a test that leaves the page locked would decide
// the outcome of the next one.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolateListeners } from './isolation.js';

let initModal;
let releaseListeners;

const MARKUP = `
  <button id="opener" data-open-modal="vip-mentorship">Apply For VIP</button>
  <button id="plainOpener" data-open-modal="general">Book a call</button>
  <button id="unknownOpener" data-open-modal="a-programme-that-was-renamed">Request</button>
  <div class="modal-overlay" id="consultationModal">
    <div class="modal-box" id="modalBox">
      <button id="closeModalBtn">Close</button>
      <form id="bookingForm">
        <input type="text" id="clientName" value="Sarah">
        <select id="clientInterest" data-interest-select>
          <option value="general" selected>General enquiry</option>
          <option value="vip-mentorship">VIP mentorship</option>
        </select>
        <button type="submit">Request consultation</button>
      </form>
    </div>
  </div>
`;

const overlayEl = () => document.getElementById('consultationModal');
const isOpen = () => overlayEl().classList.contains('active');

function render(markup = MARKUP) {
  document.body.innerHTML = markup;
  initModal();
}

function press(key) {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function submitBooking() {
  document.getElementById('bookingForm')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

beforeEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  releaseListeners = isolateListeners();
  ({ initModal } = await import('../src/scripts/modal.js'));
});

afterEach(() => {
  releaseListeners();
});

describe('opening', () => {
  it('shows the dialog and freezes the page behind it', () => {
    render();
    document.getElementById('opener').click();

    expect(isOpen()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
  });

  // A lead form is the point of the dialog, so the caret goes straight into it.
  // Focus also has to land inside for the tab trap to have anything to hold on
  // to: it keys off activeElement being one of the dialog's own controls.
  it('drops the caret into the first field', () => {
    render();
    document.getElementById('opener').click();

    expect(document.activeElement.id).toBe('clientName');
  });

  it('falls back to any focusable control when the dialog has no fields', () => {
    render(`
      <button id="opener" data-open-modal="general">Open</button>
      <div class="modal-overlay" id="consultationModal">
        <button id="closeModalBtn">Close</button>
      </div>
    `);
    document.getElementById('opener').click();

    expect(document.activeElement.id).toBe('closeModalBtn');
  });

  // Every CTA declares the offer it belongs to. Without it a visitor who
  // clicked "Apply For VIP" landed in the same blank form as everyone else, and
  // the one fact worth knowing about the lead — what they were looking at when
  // they decided — was thrown away.
  it('preselects the offer the visitor clicked', () => {
    render();
    document.getElementById('opener').click();

    expect(document.getElementById('clientInterest').value).toBe('vip-mentorship');
  });

  // A CTA can outlive the option it names: rename a programme in the select and
  // the old data-open-modal value is left pointing at nothing. Assigning it
  // anyway blanks the select, so the lead arrives with no interest at all —
  // worse than the default it replaced.
  it('leaves the field alone when the offer is no longer on the list', () => {
    render();
    document.getElementById('unknownOpener').click();

    expect(document.getElementById('clientInterest').value).toBe('general');
  });

  it('does not navigate when the CTA is a link-shaped button', () => {
    render();
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('opener').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('closing', () => {
  function open() {
    const opener = document.getElementById('opener');
    opener.focus();
    opener.click();
    return opener;
  }

  it('closes on the close button', () => {
    render();
    open();
    document.getElementById('closeModalBtn').click();

    expect(isOpen()).toBe(false);
  });

  it('closes on Escape', () => {
    render();
    open();
    press('Escape');

    expect(isOpen()).toBe(false);
  });

  it('closes on a click on the backdrop', () => {
    render();
    open();
    overlayEl().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(isOpen()).toBe(false);
  });

  // The backdrop and the dialog are the same element's inside and outside. A
  // click that started on a field bubbles up to the overlay too, and closing on
  // it would throw away whatever the visitor had typed.
  it('stays open when the click landed inside the dialog', () => {
    render();
    open();
    document.getElementById('clientName').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(isOpen()).toBe(true);
  });

  it('gives the page back', () => {
    render();
    open();
    press('Escape');

    expect(document.body.style.overflow).toBe('');
  });

  // Otherwise a keyboard user is dropped at the top of the document with no
  // indication of where the dialog they just closed used to be.
  it('hands focus back to the CTA that opened it', () => {
    render();
    const opener = open();
    press('Escape');

    expect(document.activeElement).toBe(opener);
  });

  it('remembers which of several CTAs was used', () => {
    render();
    const opener = document.getElementById('plainOpener');
    opener.focus();
    opener.click();
    press('Escape');

    expect(document.activeElement).toBe(opener);
  });

  // Escape arrives at the document whether or not anything is open. Acting on
  // it while the dialog is closed would unbalance the scroll-lock counter and
  // steal focus back to a CTA the visitor left long ago.
  it('ignores Escape when nothing is open', () => {
    render();
    document.getElementById('clientName').focus();
    press('Escape');

    expect(document.activeElement.id).toBe('clientName');
    expect(document.body.style.overflow).toBe('');
  });
});

describe('the keyboard while it is open', () => {
  it('keeps Tab inside the dialog', () => {
    render();
    document.getElementById('opener').click();

    const last = document.querySelector('#bookingForm button[type="submit"]');
    last.focus();
    press('Tab');

    expect(document.activeElement.id).toBe('closeModalBtn');
  });

  it('leaves Tab alone once the dialog is closed', () => {
    render();
    document.getElementById('opener').click();
    press('Escape');

    const event = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe('submitting the booking', () => {
  it('confirms in place instead of reloading the page', () => {
    render();
    document.getElementById('opener').click();

    const event = new window.Event('submit', { bubbles: true, cancelable: true });
    document.getElementById('bookingForm').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('.form-success')).not.toBeNull();
    expect(document.getElementById('bookingForm')).toBeNull();
  });

  it('greets the visitor by the name they gave', () => {
    render();
    document.getElementById('opener').click();
    document.getElementById('clientName').value = '  Sarah Jenkins  ';
    submitBooking();

    expect(document.querySelector('.form-success p').textContent)
      .toBe('Thanks Sarah Jenkins — Coach Elena will review your request and reach out within 24 hours.');
  });

  // The bug the restore handle exists for. Escape and a backdrop click bypass
  // the panel's own button, which used to be the only thing that put the form
  // back: the next visitor to open the dialog found the previous visitor's
  // confirmation, no fields at all, and nothing on screen able to bring them
  // back.
  it.each([
    ['Escape', () => press('Escape')],
    ['a backdrop click', () => overlayEl().dispatchEvent(new window.MouseEvent('click', { bubbles: true }))],
    ['the close button', () => document.getElementById('closeModalBtn').click()],
  ])('puts the form back when the dialog is dismissed with %s', (_, dismiss) => {
    render();
    document.getElementById('opener').click();
    submitBooking();
    dismiss();

    expect(document.getElementById('bookingForm')).not.toBeNull();
    expect(document.querySelector('.form-success')).toBeNull();

    document.getElementById('opener').click();
    expect(document.getElementById('clientName')).not.toBeNull();
  });

  it('clears the previous visitor’s answers on the way out', () => {
    render();
    document.getElementById('opener').click();
    document.getElementById('clientName').value = 'Sarah Jenkins';
    submitBooking();
    press('Escape');

    expect(document.getElementById('clientName').value).toBe('Sarah');
  });

  it('closes the dialog from the panel’s own button', () => {
    render();
    document.getElementById('opener').click();
    submitBooking();

    document.querySelector('.form-success button').click();

    expect(isOpen()).toBe(false);
    expect(document.getElementById('bookingForm')).not.toBeNull();
    expect(document.querySelector('.form-success')).toBeNull();
  });

  // The panel's button restores the form before closeModal runs, so the handle
  // has to be dropped first. Left in place it fired a second, stray restore
  // that put the form back where the panel no longer was.
  it('does not restore the form twice', () => {
    render();
    document.getElementById('opener').click();
    submitBooking();

    document.querySelector('.form-success button').click();

    expect(document.querySelectorAll('#bookingForm')).toHaveLength(1);
    expect(document.body.style.overflow).toBe('');
  });

  it('survives being opened, submitted and dismissed repeatedly', () => {
    render();

    for (let i = 0; i < 3; i += 1) {
      document.getElementById('opener').click();
      submitBooking();
      press('Escape');
    }

    expect(document.querySelectorAll('#bookingForm')).toHaveLength(1);
    expect(document.querySelectorAll('.form-success')).toHaveLength(0);
    expect(document.body.style.overflow).toBe('');
  });
});

describe('pages without a dialog', () => {
  it('does nothing rather than throwing', () => {
    document.body.innerHTML = '<main><h1>Privacy</h1></main>';
    expect(() => initModal()).not.toThrow();
  });

  it('opens a dialog that has no form in it', () => {
    render(`
      <button id="opener" data-open-modal="general">Open</button>
      <div class="modal-overlay" id="consultationModal">
        <button id="closeModalBtn">Close</button>
      </div>
    `);

    expect(() => document.getElementById('opener').click()).not.toThrow();
    expect(isOpen()).toBe(true);
  });
});
