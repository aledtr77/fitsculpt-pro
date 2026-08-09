// The calculator is the only part of the page that computes something a visitor
// could act on, and it is the only one whose defects are invisible: a wrong band
// or a wrong calorie target renders exactly as convincingly as a right one.
//
// The numbers here are worked out by hand from the WHO cut-offs and from
// Mifflin-St Jeor, not read back from what the code returns today. A test that
// records current output cannot fail for a good reason.

import { beforeEach, describe, expect, it } from 'vitest';
import { initCalculator } from '../src/scripts/calculator.js';

// Mirrors the markup in index.html: four inputs, three outputs.
function render({ height = '', weight = '', age = '28', activity = '1.375' } = {}) {
  document.body.innerHTML = `
    <form id="bmiCalcForm">
      <input type="number" id="calcHeight" value="${height}">
      <input type="number" id="calcWeight" value="${weight}">
      <input type="number" id="calcAge" value="${age}">
      <select id="calcActivity">
        <option value="1.2">Sedentary</option>
        <option value="1.375">Lightly active</option>
        <option value="1.9">Athlete</option>
      </select>
    </form>
    <p id="bmiScore">—</p>
    <p id="bmiCategory">—</p>
    <p id="macroCalories">—</p>
  `;
  if (activity !== null) document.getElementById('calcActivity').value = activity;
  initCalculator();
  return {
    form: document.getElementById('bmiCalcForm'),
    score: document.getElementById('bmiScore'),
    category: document.getElementById('bmiCategory'),
    calories: document.getElementById('macroCalories'),
  };
}

function submit(form) {
  const event = new window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  return event;
}

// At 200 cm the metre term is exactly 4, so weight ÷ 4 is the BMI and every
// boundary below can be stated as a weight without rounding anywhere.
const atBmi = (bmi) => ({ height: '200', weight: String(bmi * 4) });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('BMI', () => {
  it('reports the value to one decimal', () => {
    const { form, score } = render({ height: '165', weight: '62' });
    submit(form);
    expect(score.textContent).toBe('22.8');
  });

  // The bands are half-open and adjacent. Before that they ended at 24.9 and
  // 29.9, which left the gaps between the bands unclassified: find() fell
  // through every branch and returned the last one, so a BMI of 24.95 was
  // labelled obese.
  it.each([
    [17, 'Underweight (Tone & Gain Plan Recommended)'],
    [18.5, 'Normal Weight (Sculpt & Maintain)'],
    [22, 'Normal Weight (Sculpt & Maintain)'],
    [24.95, 'Normal Weight (Sculpt & Maintain)'],
    [25, 'Overweight (Fat Loss & Sculpting Recommended)'],
    [29.95, 'Overweight (Fat Loss & Sculpting Recommended)'],
    [30, 'Obese (Transformative Coaching Recommended)'],
    [45, 'Obese (Transformative Coaching Recommended)'],
  ])('classifies BMI %s as %s', (bmi, label) => {
    const { form, category } = render(atBmi(bmi));
    submit(form);
    expect(category.textContent).toBe(label);
  });

  // Each band opens where the previous one closes, so the cut-off value itself
  // belongs to the upper band — 18.5 is normal weight, not underweight.
  it('puts a cut-off value in the band above it', () => {
    const { form, category } = render(atBmi(18.5));
    submit(form);
    expect(category.textContent).not.toContain('Underweight');
  });

  // The label comes from the raw BMI, the score from toFixed(1). At 24.96 the
  // two disagree on sight: the page shows 25.0 and still says normal weight,
  // which is correct. Classifying the displayed string instead would flip it.
  it('classifies the measurement, not the rounded number on screen', () => {
    const { form, score, category } = render({ height: '200', weight: '99.84' });
    submit(form);
    expect(score.textContent).toBe('25.0');
    expect(category.textContent).toBe('Normal Weight (Sculpt & Maintain)');
  });

  it('colours the category with the band it fell into', () => {
    const { form, category } = render(atBmi(35));
    submit(form);
    expect(category.style.color).toBe('var(--accent-secondary)');
  });
});

describe('daily calories', () => {
  // Mifflin-St Jeor, female variant, at 62 kg / 165 cm / 28 years:
  //   (10 × 62) + (6.25 × 165) − (5 × 28) − 161 = 1350.25 BMR
  //   × 1.375 lightly active = 1856.59 → 1857
  it('applies Mifflin-St Jeor and the activity multiplier', () => {
    const { form, calories } = render({ height: '165', weight: '62', age: '28', activity: '1.375' });
    submit(form);
    // Built from toLocaleString rather than a literal "1,857": the separator is
    // the host's, and a hardcoded comma fails on any machine that groups
    // differently or does not group at all.
    expect(calories.textContent).toBe(`${(1857).toLocaleString()} kcal/day Target`);
  });

  it('moves with the activity level', () => {
    const { form, calories } = render({ height: '165', weight: '62', age: '28', activity: '1.9' });
    submit(form);
    // 1350.25 × 1.9 = 2565.475 → 2565
    expect(calories.textContent).toBe(`${(2565).toLocaleString()} kcal/day Target`);
  });

  // The formula is a straight line and nothing in it is clamped, so a small
  // enough body with a high enough age drives BMR below zero. A negative
  // calorie target on a coaching page is worse than no target.
  it('never shows a negative target', () => {
    const { form, calories } = render({ height: '80', weight: '25', age: '200', activity: '1.2' });
    submit(form);
    expect(calories.textContent).toBe('0 kcal/day Target');
  });

  it('leaves the page alone when it has nowhere to put the number', () => {
    const { form, category } = render({ height: '165', weight: '62' });
    document.getElementById('macroCalories').remove();
    expect(() => submit(form)).not.toThrow();
    expect(category.textContent).toBe('Normal Weight (Sculpt & Maintain)');
  });
});

describe('missing and unusable input', () => {
  it.each([
    ['both fields blank', { height: '', weight: '' }],
    ['no height', { height: '', weight: '62' }],
    ['no weight', { height: '165', weight: '' }],
    ['zero height', { height: '0', weight: '62' }],
    ['negative weight', { height: '165', weight: '-62' }],
  ])('asks again rather than printing a number: %s', (_, input) => {
    const { form, score, category } = render(input);
    submit(form);
    expect(category.textContent).toBe('Please enter a valid height and weight');
    expect(score.textContent).toBe('—');
  });

  // Age and activity are optional on the form, so a blank one has to fall back
  // rather than poison the arithmetic — parseFloat('') is NaN, and NaN
  // propagates all the way to "NaN kcal/day Target" without throwing.
  it('falls back to 25 years when age is blank', () => {
    const { form, calories } = render({ height: '165', weight: '62', age: '' });
    submit(form);
    // 620 + 1031.25 − 125 − 161 = 1365.25 × 1.375 = 1877.22 → 1877
    expect(calories.textContent).toBe(`${(1877).toLocaleString()} kcal/day Target`);
  });

  it('falls back to lightly active when the activity field is missing', () => {
    const { form, calories } = render({ height: '165', weight: '62', age: '28' });
    document.getElementById('calcActivity').remove();
    submit(form);
    expect(calories.textContent).toBe(`${(1857).toLocaleString()} kcal/day Target`);
  });

  it('never prints NaN', () => {
    const { form, score, calories } = render({ height: 'abc', weight: 'abc', age: 'abc' });
    submit(form);
    expect(score.textContent).not.toContain('NaN');
    expect(calories.textContent).not.toContain('NaN');
  });
});

describe('wiring', () => {
  // Without preventDefault the form does a native GET submit: the page reloads
  // and the result the visitor asked for is gone before they can read it.
  it('handles the submit itself instead of navigating', () => {
    const { form } = render({ height: '165', weight: '62' });
    expect(submit(form).defaultPrevented).toBe(true);
  });

  // main.js runs every init on every page. The calculator only exists on the
  // landing page; on the privacy page this must do nothing at all.
  it('does nothing on a page without the calculator', () => {
    document.body.innerHTML = '<main><h1>Privacy</h1></main>';
    expect(() => initCalculator()).not.toThrow();
  });

  it('does nothing when the form is there but the outputs are not', () => {
    document.body.innerHTML = `
      <form id="bmiCalcForm">
        <input id="calcHeight" value="165">
        <input id="calcWeight" value="62">
      </form>
    `;
    initCalculator();
    expect(() => submit(document.getElementById('bmiCalcForm'))).not.toThrow();
  });
});
