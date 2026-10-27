#!/usr/bin/env bash
# Fails if any commit in the range isn't authored by WISDOMSKA(SENYA), or carries
# a tool attribution. Usage: scripts/check-authorship.sh <base-sha> <head-sha>
set -euo pipefail
base="$1"; head="$2"
expected_name='WISDOMSKA(SENYA)'
expected_email='102672450+wisdomska@users.noreply.github.com'
status=0
while IFS= read -r sha; do
  name=$(git log -1 --format='%an' "$sha")
  email=$(git log -1 --format='%ae' "$sha")
  if [[ "$name" != "$expected_name" || "$email" != "$expected_email" ]]; then
    echo "::error::$sha is authored by '$name <$email>', expected '$expected_name <$expected_email>'"
    status=1
  fi
  if git log -1 --format='%B' "$sha" | grep -qiE 'co-authored-by|claude|anthropic|generated with'; then
    echo "::error::$sha has a forbidden attribution in its message"
    status=1
  fi
done < <(git rev-list --no-merges "$base..$head")
exit $status
