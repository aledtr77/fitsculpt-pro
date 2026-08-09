// The pages of the site are listed in two places that nothing keeps aligned:
// the input map in vite.config.js and public/sitemap.xml. Adding a page means
// remembering both, and forgetting one breaks nothing visible here — the build
// passes, lint passes, the greps over dist/ pass. It only shows up later, and
// in two different ways: a page that never gets built, or a sitemap that sends
// a crawler to a 404.
//
// The source of truth is the .html files actually on disk. Everything else has
// to match them.
//
// A note on what this does NOT check: the links inside the HTML. That is not a
// mechanical invariant here — privacy and disclaimer live in the footer only,
// and 404.html is linked from nowhere. Both by choice, so checking there would
// only produce false positives.
//
// Usage: node scripts/check-pages.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

// 404.html is deliberately outside the sitemap: it is an error page, not
// content to be indexed.
const NOT_IN_SITEMAP = new Set(['404.html']);

// --- Source of truth: the pages actually present in the repo -----------------
// The landing page and the 404 sit at the root; the supporting documents live
// under pages/.
const pages = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...readdirSync(join(ROOT, 'pages'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => `pages/${f}`),
].sort();

// --- 1. vite.config.js: what actually gets built -----------------------------
const viteInputs = [...read('vite.config.js').matchAll(/resolve\(here,\s*['"]([^'"]+)['"]\)/g)]
  .map((m) => m[1])
  .sort();

// --- 2. public/sitemap.xml: what we declare to search engines ----------------
const sitemapPages = [...read('public/sitemap.xml').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
  .map((m) => {
    const path = new URL(m[1]).pathname;
    return path === '/' ? 'index.html' : path.replace(/^\//, '');
  })
  .sort();

// --- Comparison --------------------------------------------------------------
const problems = [];

const compare = (label, actual, expected, fixHint) => {
  const missing = expected.filter((p) => !actual.includes(p));
  const extra = actual.filter((p) => !expected.includes(p));
  if (missing.length) problems.push(`${label}: missing ${missing.join(', ')} — ${fixHint}`);
  if (extra.length) problems.push(`${label}: lists ${extra.join(', ')}, which does not exist on disk`);
};

compare(
  'vite.config.js (build inputs)',
  viteInputs,
  pages,
  'add it to rollupOptions.input, or it never gets built'
);
compare(
  'public/sitemap.xml',
  sitemapPages,
  pages.filter((p) => !NOT_IN_SITEMAP.has(p)),
  'add the matching <loc>'
);

if (problems.length) {
  console.error('The page lists have drifted apart:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nPages on disk (source of truth): ${pages.join(', ')}`);
  process.exit(1);
}

console.log(`Page lists aligned: ${pages.length} pages.`);
