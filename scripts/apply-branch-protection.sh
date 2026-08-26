#!/usr/bin/env bash
#
# Apply BugRout's branch-protection rules to main.
#
# Branch protection is a forge setting, not a file in the repository, so it
# cannot be reviewed in a diff or reverted with a commit. This script exists so
# it is at least written down, idempotent, and applied the same way every time.
#
# Requires: gh, authenticated with admin rights on the repository.
#
# Usage:
#   bash scripts/apply-branch-protection.sh            # apply
#   bash scripts/apply-branch-protection.sh --show     # print current settings
#
set -euo pipefail

REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
BRANCH="${BRANCH:-main}"

# Required status checks are named by their *job* name, as displayed on the PR.
#
# Docs / "Link check (lychee)" is deliberately not required: it is path-filtered
# to Markdown, so on a PR that touches no docs it never runs, and GitHub treats
# a required check that never reports as permanently pending.
REQUIRED_CHECKS=(
  "Format, Lint, Typecheck, Test"   # ci.yml
  "Semgrep (OWASP Top 10)"          # security.yml
  "OSV-Scanner"                     # security.yml
)

if [ "${1:-}" = "--show" ]; then
  gh api "repos/$REPO/branches/$BRANCH/protection" \
    --jq '{required_status_checks, required_pull_request_reviews, enforce_admins, allow_force_pushes, allow_deletions}'
  exit 0
fi

checks_json=$(printf '%s\n' "${REQUIRED_CHECKS[@]}" | jq -R . | jq -s '{strict: true, contexts: .}')

payload=$(jq -n --argjson checks "$checks_json" '{
  required_status_checks: $checks,
  enforce_admins: false,
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
    require_last_push_approval: true,
    require_code_owner_reviews: false
  },
  restrictions: null,
  required_conversation_resolution: true,
  allow_force_pushes: false,
  allow_deletions: false
}')

echo "Applying branch protection to $REPO@$BRANCH…"
echo "$payload" | gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input - >/dev/null
echo "Done. Current settings:"
gh api "repos/$REPO/branches/$BRANCH/protection" \
  --jq '{required_status_checks, required_pull_request_reviews, enforce_admins}'
