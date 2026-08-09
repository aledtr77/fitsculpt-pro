// Deliberately not an extension of vite.config.js. That file exists to produce
// dist/; none of it has anything to say about whether the BMI bands are right,
// and pulling it in would make every test run pay for a build it does not use.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom, not node — and that is the opposite of the sibling templates on
    // purpose. There the logic worth testing was deliberately kept out of the
    // DOM, so a node environment covered it. Here there is no such layer: every
    // module in src/scripts/ is an init function that reads the document and
    // writes it back. Testing it in node would mean testing a reimplementation
    // of it, which is the one thing a test must never do.
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
