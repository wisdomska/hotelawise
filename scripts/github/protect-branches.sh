#!/usr/bin/env bash
# One-off: creates `preview` from `main` (if missing) and protects both branches.
# Run it yourself after `gh auth login` (this needs repository admin rights):
#   bash scripts/github/protect-branches.sh wisdomska/hotelawise
set -euo pipefail
repo="${1:-wisdomska/hotelawise}"

if ! gh api "repos/$repo/branches/preview" >/dev/null 2>&1; then
  sha=$(gh api "repos/$repo/git/ref/heads/main" --jq .object.sha)
  gh api "repos/$repo/git/refs" -f ref=refs/heads/preview -f sha="$sha" >/dev/null
  echo "created preview from main"
fi

for branch in main preview; do
  gh api -X PUT "repos/$repo/branches/$branch/protection" --input - <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint, format, typecheck, unit tests",
      "Integration tests (Postgres)",
      "Worker build and size",
      "E2E (Playwright)",
      "analyze"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "require_code_owner_reviews": false },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
  echo "protected $branch"
done
