// The six interactions on the landing page. None of them is guarded by
// anything the build can see: a filter that hides the wrong cards, a price
// labelled with the wrong period and a header stuck transparent all compile,
// load and look deliberate.
//
// Imported fresh per test — animations.js drives the same reference-counted
// scroll lock as the dialog, and the counter lives at module scope.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolateListeners } from './isolation.js';

let initAnimations;
let releaseListeners;

// Queued frames are collected rather than run, so a test decides when the
// scroll handlers get their turn instead of racing a real one.
let frames = [];
const flushFrames = () => {
  const queued = frames;
  frames = [];
  queued.forEach((cb) => cb());
};

const scrollTo = (y) => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
  window.dispatchEvent(new window.Event('scroll'));
  flushFrames();
};

// jsdom has no layout, so every offsetTop is 0 and the scroll spy would have
// nothing to compare against. The positions are stated instead.
const placeAt = (el, top) => Object.defineProperty(el, 'offsetTop', { value: top, configurable: true });

// jsdom implements no media queries at all. This stands in for one and hands
// back the change listener, which is the only part any of this depends on.
let breakpointListener = null;
function stubMatchMedia({ matches = false } = {}) {
  breakpointListener = null;
  window.matchMedia = (media) => ({
    media,
    matches,
    addEventListener: (_, handler) => { breakpointListener = handler; },
    removeEventListener: () => {},
  });
}

function press(key) {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function render(markup) {
  document.body.innerHTML = markup;
  initAnimations();
}

beforeEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  frames = [];
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
  stubMatchMedia();
  releaseListeners = isolateListeners();
  ({ initAnimations } = await import('../src/scripts/animations.js'));
});

afterEach(() => {
  releaseListeners();
});

describe('header on scroll', () => {
  const withHero = `
    <header class="site-header"></header>
    <main><section class="hero-section"></section></main>
  `;

  it('starts transparent over the hero', () => {
    render(withHero);
    expect(document.querySelector('.site-header').classList.contains('scrolled')).toBe(false);
  });

  it('goes solid once the hero is behind it', () => {
    render(withHero);
    scrollTo(60);

    expect(document.querySelector('.site-header').classList.contains('scrolled')).toBe(true);
  });

  it('goes back to transparent at the top of the page', () => {
    render(withHero);
    scrollTo(60);
    scrollTo(0);

    expect(document.querySelector('.site-header').classList.contains('scrolled')).toBe(false);
  });

  // The privacy page, the disclaimer and the 404 have no hero. They ship the
  // solid class in their markup, and a header that recomputed it from scrollY
  // would strip it straight back off at the top of the page, leaving a
  // see-through bar over the text.
  it('stays solid on a page with no hero', () => {
    render('<header class="site-header scrolled"></header><main><h1>Privacy</h1></main>');
    scrollTo(0);

    expect(document.querySelector('.site-header').classList.contains('scrolled')).toBe(true);
  });

  it('adds the solid class itself if the page forgot to ship it', () => {
    render('<header class="site-header"></header><main><h1>Privacy</h1></main>');

    expect(document.querySelector('.site-header').classList.contains('scrolled')).toBe(true);
  });

  // Scroll fires far more often than the screen repaints and both listeners
  // read layout, so running them raw thrashes the layout engine. One frame per
  // burst is the whole point of the coalescing.
  it('does one pass per frame however many scroll events arrive', () => {
    render(withHero);
    frames = [];

    for (let i = 0; i < 5; i += 1) window.dispatchEvent(new window.Event('scroll'));

    expect(frames).toHaveLength(1);
  });

  it('accepts the next burst once the frame has run', () => {
    render(withHero);
    frames = [];

    window.dispatchEvent(new window.Event('scroll'));
    flushFrames();
    window.dispatchEvent(new window.Event('scroll'));

    expect(frames).toHaveLength(1);
  });

  it('does nothing on a page with no header', () => {
    expect(() => render('<main><h1>Privacy</h1></main>')).not.toThrow();
  });
});

describe('scroll spy', () => {
  function page() {
    render(`
      <header class="site-header"></header>
      <nav>
        <a class="nav-link" href="#about">About</a>
        <a class="nav-link" href="#programs">Programs</a>
        <a class="nav-link" href="#pricing">Pricing</a>
        <a class="nav-link" href="/pages/privacy.html">Privacy</a>
        <a class="nav-link" href="#">Top</a>
      </nav>
      <main>
        <section class="hero-section" id="hero"></section>
        <section id="about"></section>
        <section id="programs"></section>
        <section id="pricing"></section>
      </main>
    `);
    placeAt(document.getElementById('hero'), 0);
    placeAt(document.getElementById('about'), 800);
    placeAt(document.getElementById('programs'), 1600);
    placeAt(document.getElementById('pricing'), 2400);
  }

  const activeLink = () => document.querySelector('.nav-link.active')?.getAttribute('href');

  it('highlights the section the reader is in', () => {
    page();
    scrollTo(1700);

    expect(activeLink()).toBe('#programs');
  });

  // The probe sits 120px below the top of the viewport, so a section counts as
  // current shortly before its heading reaches the top edge.
  it('switches over as the next section comes up', () => {
    page();
    scrollTo(1479);
    expect(activeLink()).toBe('#about');

    scrollTo(1480);
    expect(activeLink()).toBe('#programs');
  });

  // The last section is usually shorter than the viewport, so scrolling to the
  // bottom of the page never puts its top edge under the probe. Walking the
  // list backwards and taking the first match is what keeps it highlighted
  // instead of handing the highlight back to the section above it.
  it('keeps the last section highlighted at the bottom of the page', () => {
    page();
    scrollTo(9000);

    expect(activeLink()).toBe('#pricing');
  });

  it('highlights one link at a time', () => {
    page();
    scrollTo(1700);

    expect(document.querySelectorAll('.nav-link.active')).toHaveLength(1);
  });

  it('ignores links that do not point at a section of this page', () => {
    page();
    scrollTo(9000);

    expect(document.querySelector('[href="/pages/privacy.html"]').classList.contains('active')).toBe(false);
    expect(document.querySelector('[href="#"]').classList.contains('active')).toBe(false);
  });

  it('does nothing on a page with sections but no anchor navigation', () => {
    expect(() => render('<main><section id="about"></section></main>')).not.toThrow();
  });
});

describe('program filter', () => {
  const page = `
    <div>
      <button class="tab-btn" data-filter="all" aria-pressed="true">All</button>
      <button class="tab-btn" data-filter="strength" aria-pressed="false">Strength</button>
      <button class="tab-btn" data-filter="hiit" aria-pressed="false">HIIT</button>
    </div>
    <div>
      <article class="program-card" data-category="strength" id="sculpt"></article>
      <article class="program-card" data-category="hiit" id="metabolic"></article>
      <article class="program-card" data-category="strength" id="vip"></article>
    </div>
  `;

  const visible = () => [...document.querySelectorAll('.program-card')]
    .filter((card) => !card.hidden)
    .map((card) => card.id);

  it('shows only the cards in the chosen category', () => {
    render(page);
    document.querySelector('[data-filter="strength"]').click();

    expect(visible()).toEqual(['sculpt', 'vip']);
  });

  it('brings everything back', () => {
    render(page);
    document.querySelector('[data-filter="hiit"]').click();
    document.querySelector('[data-filter="all"]').click();

    expect(visible()).toEqual(['sculpt', 'metabolic', 'vip']);
  });

  // `hidden` also takes the card out of the accessibility tree. Juggling inline
  // `display` instead leaves filtered-out programmes readable by a screen
  // reader and reachable by the keyboard, on a grid that visibly shows three.
  it('hides cards from assistive technology, not just from view', () => {
    render(page);
    document.querySelector('[data-filter="strength"]').click();

    expect(document.getElementById('metabolic').hidden).toBe(true);
  });

  it('marks the active tab as pressed and unmarks the rest', () => {
    render(page);
    document.querySelector('[data-filter="hiit"]').click();

    const pressed = [...document.querySelectorAll('.tab-btn')]
      .filter((btn) => btn.getAttribute('aria-pressed') === 'true')
      .map((btn) => btn.dataset.filter);

    expect(pressed).toEqual(['hiit']);
  });

  it('does nothing on a page with tabs but no cards', () => {
    expect(() => render('<button class="tab-btn" data-filter="all">All</button>')).not.toThrow();
  });
});

describe('FAQ accordion', () => {
  const page = `
    <div class="accordion-item" id="one">
      <button class="accordion-header" aria-expanded="false">Q1</button>
      <div class="accordion-body">A1</div>
    </div>
    <div class="accordion-item" id="two">
      <button class="accordion-header" aria-expanded="false">Q2</button>
      <div class="accordion-body">A2</div>
    </div>
  `;

  const openItems = () => [...document.querySelectorAll('.accordion-item.active')].map((el) => el.id);

  it('opens the question that was clicked', () => {
    render(page);
    document.querySelector('#one .accordion-header').click();

    expect(openItems()).toEqual(['one']);
    expect(document.querySelector('#one .accordion-header').getAttribute('aria-expanded')).toBe('true');
  });

  it('closes the previous one', () => {
    render(page);
    document.querySelector('#one .accordion-header').click();
    document.querySelector('#two .accordion-header').click();

    expect(openItems()).toEqual(['two']);
    expect(document.querySelector('#one .accordion-header').getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a second click on the same question', () => {
    render(page);
    const header = document.querySelector('#one .accordion-header');
    header.click();
    header.click();

    expect(openItems()).toEqual([]);
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  // The class and the attribute are two records of the same state. Leaving
  // aria-expanded behind means a screen reader announces a collapsed answer as
  // expanded, or the reverse.
  it('keeps the attribute in step with the class', () => {
    render(page);
    document.querySelector('#two .accordion-header').click();

    const expanded = [...document.querySelectorAll('.accordion-header')]
      .filter((h) => h.getAttribute('aria-expanded') === 'true')
      .map((h) => h.closest('.accordion-item').id);

    expect(expanded).toEqual(openItems());
  });
});

describe('pricing toggle', () => {
  const page = `
    <span class="billing-label">Monthly</span>
    <button id="pricingToggle" role="switch" aria-checked="false"></button>
    <span class="billing-label">Annual</span>
    <div class="pricing-card" id="starter">
      <p class="price-box">
        <span class="price-amount" data-monthly="$49" data-yearly="$39">$49</span>
        <span class="price-period">/month</span>
      </p>
    </div>
    <div class="pricing-card" id="pro">
      <p class="price-box">
        <span class="price-amount" data-monthly="$99" data-yearly="$79">$99</span>
        <span class="price-period">/month</span>
      </p>
    </div>
    <div class="pricing-card" id="free">
      <p class="price-box">
        <span class="price-amount">Free</span>
        <span class="price-period">forever</span>
      </p>
    </div>
  `;

  const amountIn = (card) => document.querySelector(`#${card} .price-amount`).textContent;
  const periodIn = (card) => document.querySelector(`#${card} .price-period`).textContent;

  it('starts on monthly', () => {
    render(page);

    expect(document.getElementById('pricingToggle').getAttribute('aria-checked')).toBe('false');
    expect(amountIn('starter')).toBe('$49');
    expect(periodIn('starter')).toBe('/month');
  });

  it('switches every card to the annual rate', () => {
    render(page);
    document.getElementById('pricingToggle').click();

    expect(amountIn('starter')).toBe('$39');
    expect(amountIn('pro')).toBe('$79');
  });

  // `data-yearly` is the *monthly* rate when billed annually, so the period has
  // to say so. Labelling $39 as "/year" against a $49 month read as a 93%
  // discount instead of the 20% the toggle actually offers — an overstated
  // price claim, not a typo.
  it('says the annual price is still per month', () => {
    render(page);
    document.getElementById('pricingToggle').click();

    expect(periodIn('starter')).toBe('/month, billed annually');
    expect(periodIn('pro')).toBe('/month, billed annually');
  });

  it('goes back to monthly', () => {
    render(page);
    const toggle = document.getElementById('pricingToggle');
    toggle.click();
    toggle.click();

    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(amountIn('starter')).toBe('$49');
    expect(periodIn('starter')).toBe('/month');
  });

  // Each card is driven from its own price box. A card with no annual rate —
  // a free tier, a one-off — must keep both its amount and its period, and an
  // implementation that rewrote every `.price-period` on the page would give
  // it a billing term it does not have.
  it('leaves a card without an annual rate untouched', () => {
    render(page);
    document.getElementById('pricingToggle').click();

    expect(amountIn('free')).toBe('Free');
    expect(periodIn('free')).toBe('forever');
  });

  it('marks which of the two labels is live', () => {
    render(page);
    const labels = document.querySelectorAll('.billing-label');
    expect([...labels].map((l) => l.classList.contains('active'))).toEqual([true, false]);

    document.getElementById('pricingToggle').click();
    expect([...labels].map((l) => l.classList.contains('active'))).toEqual([false, true]);
  });

  it('does nothing on a page with no pricing', () => {
    expect(() => render('<main><h1>Privacy</h1></main>')).not.toThrow();
  });
});

describe('mobile drawer', () => {
  const page = `
    <button id="mobileToggle" aria-expanded="false">Menu</button>
    <div id="navBackdrop"></div>
    <nav id="navMenu">
      <a class="nav-link" href="#about">About</a>
      <a class="nav-link" href="#pricing">Pricing</a>
    </nav>
  `;

  const isOpen = () => document.getElementById('mobileToggle').getAttribute('aria-expanded') === 'true';

  function open() {
    document.getElementById('mobileToggle').click();
  }

  it('opens on the toggle', () => {
    render(page);
    open();

    expect(isOpen()).toBe(true);
    expect(document.getElementById('navMenu').classList.contains('active')).toBe(true);
    expect(document.getElementById('navBackdrop').classList.contains('active')).toBe(true);
  });

  it('freezes the page behind it', () => {
    render(page);
    open();

    expect(document.body.style.overflow).toBe('hidden');
  });

  // The drawer covers the viewport. Leaving focus on the toggle behind it means
  // the first Tab walks into the page underneath, which the visitor cannot see.
  it('moves focus into the drawer', () => {
    render(page);
    open();

    expect(document.activeElement).toBe(document.querySelector('#navMenu a'));
  });

  it('keeps Tab inside the drawer while it is open', () => {
    render(page);
    open();

    document.querySelector('#navMenu a:last-of-type').focus();
    press('Tab');

    expect(document.activeElement).toBe(document.querySelector('#navMenu a'));
  });

  it.each([
    ['the toggle again', () => document.getElementById('mobileToggle').click()],
    ['Escape', () => press('Escape')],
    ['the backdrop', () => document.getElementById('navBackdrop').click()],
    ['a link in it', () => document.querySelector('#navMenu a').click()],
  ])('closes on %s', (_, close) => {
    render(page);
    open();
    close();

    expect(isOpen()).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('hands focus back to the toggle', () => {
    render(page);
    open();
    press('Escape');

    expect(document.activeElement).toBe(document.getElementById('mobileToggle'));
  });

  // Rotating a phone, or dragging a desktop window wider, crosses the drawer's
  // breakpoint. The drawer is styled away above it, so it vanishes with the
  // page still frozen behind it and nothing left on screen to unfreeze it.
  it('closes itself when the viewport grows past the breakpoint', () => {
    render(page);
    open();

    breakpointListener({ matches: true });

    expect(isOpen()).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('does nothing at the breakpoint when the drawer is already closed', () => {
    render(page);
    breakpointListener({ matches: true });

    expect(isOpen()).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });

  it('watches the same breakpoint the stylesheet uses', () => {
    const queries = [];
    window.matchMedia = (media) => {
      queries.push(media);
      return { media, matches: false, addEventListener: () => {}, removeEventListener: () => {} };
    };

    render(page);

    // layout.css hands the drawer over to the desktop bar above 1024px.
    expect(queries).toContain('(min-width: 1025px)');
  });

  // The scroll lock is reference-counted, so an unmatched close would push the
  // counter below zero and the next open would need two closes to release the
  // page — with only one control on screen able to provide either.
  it('ignores a close when it is already closed', () => {
    render(page);
    document.getElementById('navBackdrop').click();
    open();

    expect(document.body.style.overflow).toBe('hidden');

    document.getElementById('navBackdrop').click();
    expect(document.body.style.overflow).toBe('');
  });

  it('does nothing on a page with no drawer', () => {
    expect(() => render('<nav><a href="#about">About</a></nav>')).not.toThrow();
  });
});
