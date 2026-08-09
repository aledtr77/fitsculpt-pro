// Every self-referencing URL in the site is absolute, because it has to be: a
// crawler, a social card scraper and a sitemap cannot resolve a relative path.
// That means the same origin is written out by hand in a dozen places —
// canonical, og:url, og:image, the JSON-LD graph, robots.txt, sitemap.xml — and
// nothing keeps them in step.
//
// Two failures live here, and neither shows up in a browser:
//
//  - a wrong canonical. Copy a page to make the next one, forget that one line,
//    and two documents now declare the same canonical URL. The build is fine,
//    the page looks fine, and one of them quietly stops being indexed.
//  - an origin that is not this site's. With fifteen templates in the series,
//    the plausible mistake is not a typo, it is a paste from a sibling repo:
//    a perfectly formed URL pointing at somebody else's deployment.
//
// The origin is read from the sitemap rather than hardcoded, so this keeps
// working for anyone who forks the repo and points it at their own domain —
// which the README tells them to do. It checks agreement, not a fixed value.
//
// Usage: node scripts/check-origin.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

const problems = [];

// --- The origin every self-reference has to agree on -------------------------
const sitemap = read('public/sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
if (!locs.length) {
  console.error('public/sitemap.xml has no <loc>: there is no origin to check against.');
  process.exit(1);
}
const ORIGIN = new URL(locs[0]).origin;

// --- The pages, and the URL each one is supposed to claim as its own ---------
// 404.html is the exception: it answers for any unknown path, so no single URL
// is its own. It carries neither canonical nor og:url, and must not grow one.
const selfUrl = (page) => (page === 'index.html' ? `${ORIGIN}/` : `${ORIGIN}/${page}`);
const pages = [
  ...readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...readdirSync(join(ROOT, 'pages'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => `pages/${f}`),
].sort();

const tag = (src, re) => {
  const m = src.match(re);
  return m ? m[1] : null;
};

for (const page of pages) {
  const src = read(page);
  const canonical = tag(src, /<link\s+rel="canonical"\s+href="([^"]+)"/);
  const ogUrl = tag(src, /<meta\s+property="og:url"\s+content="([^"]+)"/);
  const ogImage = tag(src, /<meta\s+property="og:image"\s+content="([^"]+)"/);

  if (page === '404.html') {
    if (canonical) problems.push(`${page}: has a canonical — an error page has no single URL to claim`);
    if (ogUrl) problems.push(`${page}: has an og:url — an error page has no single URL to claim`);
  } else {
    const expected = selfUrl(page);
    if (canonical !== expected) {
      problems.push(`${page}: canonical is ${canonical ?? 'missing'}, should be ${expected}`);
    }
    if (ogUrl !== expected) {
      problems.push(`${page}: og:url is ${ogUrl ?? 'missing'}, should be ${expected}`);
    }
  }

  if (ogImage && !ogImage.startsWith(`${ORIGIN}/`)) {
    problems.push(`${page}: og:image points at ${ogImage}, outside ${ORIGIN}`);
  }
}

// --- The JSON-LD graph -------------------------------------------------------
// Only the fields that name this site are checked. "@context" is schema.org by
// definition, and any future sameAs would legitimately point elsewhere.
const ld = read('index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!ld) {
  problems.push('index.html: the JSON-LD block is gone');
} else {
  for (const m of ld[1].matchAll(/"(@id|url|image)":\s*"(https?:\/\/[^"]+)"/g)) {
    if (!m[2].startsWith(`${ORIGIN}/`)) {
      problems.push(`index.html JSON-LD: "${m[1]}" is ${m[2]}, outside ${ORIGIN}`);
    }
  }
}

// --- sitemap.xml and robots.txt ---------------------------------------------
for (const loc of locs) {
  if (new URL(loc).origin !== ORIGIN) {
    problems.push(`public/sitemap.xml: <loc> ${loc} is on a different origin than the others`);
  }
}
const robotsSitemap = tag(read('public/robots.txt'), /^Sitemap:\s*(\S+)/m);
if (robotsSitemap !== `${ORIGIN}/sitemap.xml`) {
  problems.push(
    `public/robots.txt: Sitemap is ${robotsSitemap ?? 'missing'}, should be ${ORIGIN}/sitemap.xml`
  );
}

// --- Nothing from a sibling template ----------------------------------------
// The deployments in this series all live on the same host, which is exactly
// what makes a stray one look right at a glance.
const host = new URL(ORIGIN).host;
for (const file of [...pages, 'public/sitemap.xml', 'public/robots.txt']) {
  for (const m of read(file).matchAll(/https?:\/\/([a-z0-9-]+\.pages\.dev)/g)) {
    if (m[1] !== host) {
      problems.push(`${file}: refers to ${m[1]} — another template's deployment`);
    }
  }
}

if (problems.length) {
  console.error(`Origins disagree (expected ${ORIGIN}, from the sitemap):\n`);
  for (const p of new Set(problems)) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`Origins consistent: everything self-referencing points at ${ORIGIN}.`);
