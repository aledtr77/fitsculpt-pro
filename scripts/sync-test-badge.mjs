// The test count in the README badge used to be typed by hand, which meant it
// was right on the day it was written and silently wrong afterwards. This reads
// the number out of the suite instead.
//
//   npm run badge         rewrites the badge to match the suite
//   npm run badge:check   fails if the two disagree — this is what CI runs
//
// The count stays in the README rather than being fetched at render time on
// purpose: no gist, no token, no bot commits in a history with one author.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const README = 'README.md';
const BADGE = /\[!\[(\d+) tests\]\(https:\/\/img\.shields\.io\/badge\/tests-(\d+)%20\(Vitest\)-([0-9a-f]{6})\)\]\(([^)]+)\)/;

function countTests() {
  const out = join(tmpdir(), `vitest-badge-${process.pid}.json`);
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    return JSON.parse(readFileSync(out, 'utf8')).numTotalTests;
  } finally {
    rmSync(out, { force: true });
  }
}

const check = process.argv.includes('--check');
const readme = readFileSync(README, 'utf8');
const match = readme.match(BADGE);

if (!match) {
  console.error(`No test badge found in ${README}. Expected the shields.io tests badge.`);
  process.exit(1);
}

const inReadme = Number(match[1]);
const actual = countTests();

if (inReadme === actual && match[1] === match[2]) {
  console.log(`Test badge is in sync: ${actual} tests.`);
  process.exit(0);
}

if (check) {
  console.error(
    `Test badge says ${inReadme}, the suite has ${actual}. Run \`npm run badge\` and commit the result.`,
  );
  process.exit(1);
}

const [, , , colour, href] = match;
const updated = readme.replace(
  BADGE,
  `[![${actual} tests](https://img.shields.io/badge/tests-${actual}%20(Vitest)-${colour})](${href})`,
);
writeFileSync(README, updated);
console.log(`Test badge updated: ${inReadme} → ${actual}.`);
