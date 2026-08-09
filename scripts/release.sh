#!/usr/bin/env bash
# One command to cut a release.
#
# Why it exists: the correct sequence is seven steps in a precise order, and
# skipping one raises no error — it just leaves the repo in a quiet,
# inconsistent state. That already happened once here: the v1.0.0 tag sat seven
# commits behind main for days, so anyone downloading from the Releases page got
# a README naming the repo wrong and none of the checks under scripts/. Nothing
# was broken, nothing said anything.
#
# What this does NOT decide is when. Dependency bumps are not releases here:
# nobody consumes this package.json's version, and a Dependabot merge changes
# which Vite compiles an identical source. A release means the template itself
# changed and the snapshot people download is different. That is a judgement
# call, and it stays yours — this only makes sure that once you have made it,
# nothing gets left half-done.
#
# Everything irreversible (the tag, the push, the release) happens after every
# precondition has been checked.
#
# Usage:
#   npm run release                        patch:  1.1.0 -> 1.1.1
#   npm run release -- minor                       1.1.0 -> 1.2.0
#   npm run release -- 2.0.0               explicit version
#   npm run release -- minor --notes n.md  prose release notes from a file
#   npm run release -- --dry-run           print what it would do, do nothing
#
# Without --notes the release is created with GitHub's generated notes, which
# are a commit list. Fine for a small fix; for anything a reader would want to
# understand, write the file.
set -euo pipefail
cd "$(dirname "$0")/.."

LEVEL="patch"
DRY_RUN=0
NOTES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --notes) shift; NOTES="${1:-}"; [ -n "$NOTES" ] || { echo "ERROR: --notes needs a file" >&2; exit 2; } ;;
    patch|minor|major) LEVEL="$1" ;;
    [0-9]*.[0-9]*.[0-9]*) LEVEL="$1" ;;
    *) echo "ERROR: unrecognised argument '$1'" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then echo "   [dry-run] $*"; else "$@"; fi; }

CURRENT=$(node -p "require('./package.json').version")
say "Releasing from v$CURRENT  (bump: $LEVEL)"
[ "$DRY_RUN" = 1 ] && echo "   DRY-RUN: nothing will be modified"

# --- Preconditions: everything that makes a release wrong or pointless --------
say "1. Preconditions"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "main" ] || fail "you are on '$BRANCH'; releases are cut from main"
echo "   branch: main"

[ -z "$(git status --porcelain)" ] || fail "uncommitted changes: commit or discard them first"
echo "   working tree: clean"

[ -z "$NOTES" ] || [ -f "$NOTES" ] || fail "notes file '$NOTES' does not exist"

git fetch origin --quiet
LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "   main is level with origin/main"
elif git merge-base --is-ancestor main origin/main 2>/dev/null; then
  # origin has commits you do not — typically a PR just merged on GitHub. It is
  # a pure fast-forward, so it happens here rather than stopping to make you
  # remember a `git pull` mid-procedure. Stopping would also be the dangerous
  # option: releasing without realigning would cut that work out of the tag.
  AHEAD=$(git rev-list --count main..origin/main)
  echo "   origin/main is $AHEAD commits ahead: fast-forwarding"
  run git merge --ff-only origin/main --quiet
  [ "$DRY_RUN" = 1 ] && echo "   [dry-run] the numbers below ignore those $AHEAD commits"
elif git merge-base --is-ancestor origin/main main 2>/dev/null; then
  echo "   main has $(git rev-list --count origin/main..main) unpushed commits (they go out with this)"
else
  fail "main and origin/main have diverged: sort that out by hand"
fi

command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 \
  || fail "gh is not available or not authenticated, and the GitHub release cannot be created without it"

# Releasing from a red main freezes a known defect behind a tag. Status is read
# alongside conclusion on purpose: a run still in flight reports an empty
# conclusion, which is indistinguishable from "no run at all" if you only ask
# for the conclusion — and "still running" is exactly when you must not tag.
CI=$(gh run list --branch main --workflow CI --limit 1 --json status,conclusion \
  --jq '.[0] | "\(.status):\(.conclusion)"' 2>/dev/null || echo "")
case "$CI" in
  completed:success) echo "   CI on main: green" ;;
  ""|null*)          echo "   CI on main: no run found (continuing)" ;;
  completed:*)       fail "CI on main is '${CI#completed:}': do not release until it is green" ;;
  *)                 fail "CI on main is still ${CI%%:*}: wait for it before tagging" ;;
esac

# A reminder, not a block. Dependency bumps do not deserve a release of their
# own, but if one is sitting open it may as well ride along with this one.
OPEN=$(gh pr list --state open --author app/dependabot --json number,title \
  --jq '.[] | "#\(.number) \(.title)"' 2>/dev/null || true)
if [ -n "$OPEN" ]; then
  echo
  echo "   NOTE: Dependabot PRs are open:"
  echo "$OPEN" | sed 's/^/     /'
  echo "     To ship them with this release, merge them first:"
  echo "       gh pr merge <number> --rebase --delete-branch && git pull"
fi

# --- Checks: better to find out now than after the tag -----------------------
# These always run, dry-run included. They are read-only, and a dry-run printing
# "ok" without having run them would be false reassurance — worse than not
# checking at all.
say "2. Checks"
npm run lint --silent
echo "   lint: clean"
npm run check --silent >/dev/null
echo "   sources agree with themselves"
npm run build --silent >/dev/null
echo "   build: ok"

# --- From here on things change ----------------------------------------------
say "3. Version, commit, tag"
if [ "$DRY_RUN" = 1 ]; then
  NEXT=$(node -p "
    const v='$CURRENT'.split('.').map(Number);
    const l='$LEVEL';
    if (/^[0-9]/.test(l)) l;
    else if (l==='major') [v[0]+1,0,0].join('.');
    else if (l==='minor') [v[0],v[1]+1,0].join('.');
    else [v[0],v[1],v[2]+1].join('.');
  ")
  echo "   [dry-run] new version: $NEXT"
  echo "   [dry-run] commit 'release v$NEXT', tag v$NEXT, push"
else
  npm version "$LEVEL" --no-git-tag-version >/dev/null
  NEXT=$(node -p "require('./package.json').version")
  echo "   new version: $NEXT"
  git add package.json package-lock.json
  git commit -q -m "release v$NEXT"
  git tag "v$NEXT"
  git push --quiet
  git push --quiet origin "v$NEXT"
  echo "   commit, tag v$NEXT and push: done"
fi

# --- The step that would otherwise be forgotten -------------------------------
# A tag with no release behind it is invisible: the Releases page is what people
# actually look at, and it would keep showing the previous version as current.
say "4. GitHub release"
if [ -n "$NOTES" ]; then
  NOTES_ARGS=(--notes-file "$NOTES")
  echo "   notes: $NOTES"
else
  NOTES_ARGS=(--generate-notes)
  echo "   notes: generated from the commits"
fi
run gh release create "v$NEXT" --title "FitSculpt Pro v$NEXT" "${NOTES_ARGS[@]}"

say "Done."
if [ "$DRY_RUN" = 1 ]; then
  echo "Nothing was applied. Run again without --dry-run to do it for real."
else
  echo "https://github.com/aledtr77/fitsculpt-pro/releases/tag/v$NEXT"
fi
