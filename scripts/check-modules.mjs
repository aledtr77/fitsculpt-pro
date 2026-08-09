// Both entry points are hand-maintained lists of imports: src/styles/main.css
// pulls in the five stylesheets, src/scripts/main.js pulls in the feature
// modules. Nothing verifies that the files on disk and those lists agree.
//
// A dropped import is the quiet kind of defect. Vite builds it, lint accepts it
// (nothing is undefined — the code simply never ships), the page loads, and the
// only symptom is a section rendering unstyled or a feature that does nothing
// when clicked. On a single-page landing that is the calculator, or the modal,
// or the whole components layer.
//
// Both directions are checked. A file present but unreachable is dead weight
// you believe is live; an import pointing at a file that is not there would
// have failed the build anyway, but the message here is clearer.
//
// Usage: node scripts/check-modules.mjs

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Walks the import graph from an entry file and returns everything it reaches.
// Only relative specifiers are followed: bare ones are packages, and the font
// stylesheet is linked from the HTML rather than imported.
const reachable = (dir, entry, pattern) => {
  const seen = new Set();
  const queue = [entry];
  const missing = [];

  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);

    const full = join(ROOT, dir, file);
    if (!existsSync(full)) {
      missing.push(file);
      continue;
    }
    for (const m of readFileSync(full, 'utf-8').matchAll(pattern)) {
      queue.push(normalize(join(dirname(file), m[1])));
    }
  }
  return { seen, missing };
};

const problems = [];

const audit = (dir, entry, pattern, fixHint) => {
  const onDisk = readdirSync(join(ROOT, dir)).filter((f) => f !== entry);
  const { seen, missing } = reachable(dir, entry, pattern);

  const orphans = onDisk.filter((f) => !seen.has(f));
  if (orphans.length) {
    problems.push(`${dir}: ${orphans.join(', ')} never reached from ${entry} — ${fixHint}`);
  }
  if (missing.length) {
    problems.push(`${dir}/${entry}: imports ${missing.join(', ')}, which does not exist`);
  }
};

audit(
  'src/styles',
  'main.css',
  /@import\s+['"]\.\/([^'"]+)['"]/g,
  'the rules in it never reach the page'
);
audit(
  'src/scripts',
  'main.js',
  /from\s+['"]\.\/([^'"]+)['"]/g,
  'the module never runs in the browser'
);

if (problems.length) {
  console.error('The module graph does not cover everything on disk:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('Module graph complete: every stylesheet and script is reachable from its entry point.');
