#!/usr/bin/env bash
# Checks that the CI gates really do what they promise.
#
# A gate that has never failed is not a verified gate: it is a gate assumed to
# work. Green can mean "there are no defects" or "the check is not looking where
# it thinks it is", and the two are indistinguishable until you try. So for each
# gate the defect it claims to catch is injected on purpose, and red is the
# required outcome.
#
# Every case runs in a throwaway copy of the repo — the real one is never
# touched. node_modules is a symlink, so nothing gets reinstalled.
#
# Usage: npm run verify:gates
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

PASS=0
FAIL=0
REPORT=()

sandbox() {
  local d
  d="$(mktemp -d)"
  cp "$ROOT"/index.html "$ROOT"/404.html "$ROOT"/vite.config.js "$ROOT"/vitest.config.mjs \
     "$ROOT"/eslint.config.mjs "$ROOT"/README.md \
     "$ROOT"/package.json "$ROOT"/package-lock.json "$ROOT"/.gitignore "$d"/
  cp -r "$ROOT/src" "$ROOT/public" "$ROOT/pages" "$ROOT/scripts" "$ROOT/tests" "$d"/
  ln -s "$ROOT/node_modules" "$d/node_modules"
  echo "$d"
}

# check <name> <expected: fail|pass> <dir> <command...>
check() {
  local name="$1" expect="$2" dir="$3"
  shift 3
  local out status
  out="$( cd "$dir" && "$@" 2>&1 )"
  status=$?
  rm -rf "$dir"

  if [ "$expect" = fail ]; then
    if [ "$status" -ne 0 ]; then
      REPORT+=("  OK    $name — caught (exit $status)")
      PASS=$((PASS + 1))
    else
      REPORT+=("  HOLE  $name — THE GATE DID NOT SEE THE DEFECT")
      FAIL=$((FAIL + 1))
    fi
  else
    if [ "$status" -eq 0 ]; then
      REPORT+=("  OK    $name")
      PASS=$((PASS + 1))
    else
      REPORT+=("  BROKEN $name — fails with no defect injected:")
      REPORT+=("         $(echo "$out" | tail -3 | tr '\n' ' ')")
      FAIL=$((FAIL + 1))
    fi
  fi
}

# Checks that the mutation actually landed. Without this, a sed that no longer
# matches anything produces a case that "passes" for the wrong reason: the gate
# did not fail because there was no defect there to find.
mutate() {
  local file="$1" before after
  before="$(md5sum "$file" | cut -d' ' -f1)"
  shift
  "$@"
  after="$(md5sum "$file" | cut -d' ' -f1)"
  if [ "$before" = "$after" ]; then
    echo "INTERNAL ERROR: the mutation on $file changed nothing" >&2
    exit 1
  fi
}

# The build gate, character for character the one in .github/workflows/ci.yml.
gate_build() {
  npm run build --silent >/dev/null 2>&1 || return 1

  # Every page in the repo has to come out the other side.
  for f in index.html 404.html pages/*.html; do
    [ -f "dist/$f" ] || return 1
  done

  # And each of them has to carry the bundle. A page that lost its stylesheet
  # link still builds, still loads, and arrives unstyled.
  for f in dist/index.html dist/404.html dist/pages/*.html; do
    grep -qE 'href="/assets/main-[A-Za-z0-9_-]+\.css"' "$f" || return 1
    grep -qE 'src="/assets/main-[A-Za-z0-9_-]+\.js"' "$f" || return 1
  done

  # Nothing may point back at src/: those paths exist on your machine and
  # nowhere on the host. Vite rewrites the references it parses — what it cannot
  # see is a path assembled inside JavaScript.
  ! grep -rl '/src/' dist >/dev/null || return 1

  # 404.html answers for any unknown URL at any depth, so a relative link in it
  # resolves somewhere different every time. Absolute or external only.
  local relative
  relative="$(grep -oE 'href="[^"]*"' dist/404.html | grep -vE 'href="(/|https?://|mailto:|#)')"
  [ -z "$relative" ] || return 1
}

export -f gate_build

echo "Verifying the gates: one defect at a time, and red is required."
echo

# --- Control group: with nothing injected, everything must pass ---------------
echo "[control] intact repo: every gate must pass"
d=$(sandbox); check "control/lint"          pass "$d" npm run lint --silent
d=$(sandbox); check "control/check-pages"   pass "$d" npm run check:pages --silent
d=$(sandbox); check "control/check-origin"  pass "$d" npm run check:origin --silent
d=$(sandbox); check "control/check-modules" pass "$d" npm run check:modules --silent
d=$(sandbox); check "control/test"          pass "$d" npm test --silent
d=$(sandbox); check "control/badge"         pass "$d" npm run badge:check --silent
d=$(sandbox); check "control/build"         pass "$d" bash -c gate_build

# --- Lint: the typos Vite bundles without complaining -------------------------
echo "[lint] what the bundler is happy to ship"
d=$(sandbox)
mutate "$d/src/scripts/main.js" bash -c "echo 'docuemnt.querySelector(\".x\");' >> '$d/src/scripts/main.js'"
check "lint/identifier that does not exist (docuemnt)" fail "$d" npm run lint --silent

d=$(sandbox)
mutate "$d/src/scripts/main.js" bash -c "echo 'const leftoverDebugFlag = 1;' >> '$d/src/scripts/main.js'"
check "lint/variable never used" fail "$d" npm run lint --silent

# --- Page lists: two places nothing keeps aligned -----------------------------
echo "[check-pages] the lists nothing keeps aligned"
d=$(sandbox)
mutate "$d/vite.config.js" perl -0pi -e 's{\s*privacy: resolve\(here, .pages/privacy\.html.\),}{}' "$d/vite.config.js"
check "check-pages/page dropped from the vite inputs" fail "$d" npm run check:pages --silent

d=$(sandbox)
mutate "$d/public/sitemap.xml" perl -0pi -e 's{<url>\s*<loc>[^<]*privacy\.html</loc>.*?</url>}{}s' "$d/public/sitemap.xml"
check "check-pages/page dropped from the sitemap" fail "$d" npm run check:pages --silent

# --- Origins: absolute URLs written out by hand -------------------------------
echo "[check-origin] the URLs that only a crawler ever reads"
d=$(sandbox)
mutate "$d/pages/privacy.html" perl -pi -e 's{(rel="canonical" href="[^"]*/pages/)privacy(\.html")}{${1}disclaimer${2}}' "$d/pages/privacy.html"
check "check-origin/canonical copy-pasted from the sibling page" fail "$d" npm run check:origin --silent

d=$(sandbox)
mutate "$d/public/robots.txt" perl -pi -e 's{^(Sitemap: https://)[^/]+}{${1}example.com}m' "$d/public/robots.txt"
check "check-origin/robots pointing at another origin" fail "$d" npm run check:origin --silent

d=$(sandbox)
mutate "$d/index.html" perl -pi -e 's{</head>}{<link rel="alternate" href="https://coach-lifefitness.pages.dev/"></head>}' "$d/index.html"
check "check-origin/URL pasted in from a sibling template" fail "$d" npm run check:origin --silent

# --- Module graph: imports that ship nothing when they go missing -------------
echo "[check-modules] the imports that fail silently"
d=$(sandbox)
mutate "$d/src/styles/main.css" perl -pi -e "s{\@import './components\.css';\n}{}" "$d/src/styles/main.css"
check "check-modules/stylesheet no longer imported" fail "$d" npm run check:modules --silent

d=$(sandbox)
mutate "$d/src/scripts/main.js" perl -pi -e "s{import \{ initAnimations \} from './animations\.js';\n}{}; s{\s*initAnimations\(\);\n}{\n}" "$d/src/scripts/main.js"
check "check-modules/feature module no longer imported" fail "$d" npm run check:modules --silent

# --- Tests: the behaviour that looks identical when it is wrong ---------------
# Every defect below renders. The page loads, nothing is undefined, lint and the
# build are green, and the only way to find out is to read the number on screen
# and know what it should have said.
echo "[test] the defects that still look like a working page"
d=$(sandbox)
mutate "$d/src/scripts/calculator.js" perl -pi -e 's/\{ max: 25,/{ max: 24.9,/' "$d/src/scripts/calculator.js"
check "test/BMI band that leaves a gap between two bands" fail "$d" npm test --silent

d=$(sandbox)
mutate "$d/src/scripts/animations.js" perl -pi -e "s{'/month, billed annually'}{'/year'}" "$d/src/scripts/animations.js"
check "test/annual price labelled as a yearly total" fail "$d" npm test --silent

d=$(sandbox)
mutate "$d/src/scripts/overlay.js" perl -pi -e "s{if \(locks === 0\) document\.body\.style\.overflow = '';}{document.body.style.overflow = '';}" "$d/src/scripts/overlay.js"
check "test/scroll lock released while an overlay is still open" fail "$d" npm test --silent

d=$(sandbox)
mutate "$d/src/scripts/modal.js" perl -pi -e 's{^\s*restoreForm\?\.\(\);\n}{}' "$d/src/scripts/modal.js"
check "test/booking form never restored after a dismissal" fail "$d" npm test --silent

d=$(sandbox)
mutate "$d/src/scripts/forms.js" perl -pi -e 's{body\.textContent = message;}{body.innerHTML = message;}' "$d/src/scripts/forms.js"
check "test/visitor text written into the panel as markup" fail "$d" npm test --silent

d=$(sandbox)
mutate "$d/src/scripts/theme.js" perl -pi -e "s{theme === 'light' \? 'dark' : 'light'}{theme === 'light' ? 'light' : 'dark'}" "$d/src/scripts/theme.js"
check "test/toggle announcing its state instead of its action" fail "$d" npm test --silent

# --- Badge: a number that is right the day it is typed ------------------------
echo "[badge] the count that goes stale on its own"
d=$(sandbox)
mutate "$d/README.md" perl -pi -e 's{\[!\[(\d+) tests\]}{"[![".($1 + 1)." tests]"}e' "$d/README.md"
check "badge/README claiming a test count the suite does not have" fail "$d" npm run badge:check --silent

# --- Build output: what actually reaches the host -----------------------------
echo "[build] what actually gets deployed"
d=$(sandbox)
mutate "$d/vite.config.js" perl -0pi -e 's{\s*disclaimer: resolve\(here, .pages/disclaimer\.html.\),}{}' "$d/vite.config.js"
check "build/page in the repo that never gets built" fail "$d" bash -c gate_build

d=$(sandbox)
mutate "$d/404.html" perl -pi -e 's{href="/pages/privacy\.html"}{href="pages/privacy.html"}' "$d/404.html"
check "build/relative link in the 404" fail "$d" bash -c gate_build

d=$(sandbox)
mutate "$d/pages/privacy.html" perl -pi -e 's{<link rel="stylesheet" href="\.\./src/styles/main\.css">\n}{}' "$d/pages/privacy.html"
check "build/page shipped without its stylesheet" fail "$d" bash -c gate_build

d=$(sandbox)
mutate "$d/src/scripts/main.js" bash -c "echo \"document.documentElement.dataset.hero = '/src/assets/images/hero-model-512.webp';\" >> '$d/src/scripts/main.js'"
check "build/asset path assembled in JS, never rewritten" fail "$d" bash -c gate_build

# --- Outcome ------------------------------------------------------------------
echo
printf '%s\n' "${REPORT[@]}"
echo
echo "Passed: $PASS   Problems: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
