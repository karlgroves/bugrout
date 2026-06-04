#!/usr/bin/env bash
# Installs the system binaries the local quality gates need.
# Node-level deps come from `pnpm install`.
set -euo pipefail

need() { command -v "$1" >/dev/null 2>&1; }

echo "Checking required tools..."

need node || {
  echo "Missing: node — install Node 22 via nvm (https://github.com/nvm-sh/nvm), then 'nvm use'"
  exit 1
}
need git || { echo "Missing: git"; exit 1; }

if ! need pnpm; then
  echo "Installing pnpm via corepack..."
  corepack enable && corepack prepare --activate
fi

install_brew_or_hint() {
  tool="$1"; url="$2"
  if need "$tool"; then return 0; fi
  echo "Installing $tool..."
  if need brew && brew install "$tool"; then return 0; fi
  echo "Could not auto-install $tool — get it from $url"
  return 1
}

status=0
install_brew_or_hint gitleaks "https://github.com/gitleaks/gitleaks/releases" || status=1
install_brew_or_hint osv-scanner "https://github.com/google/osv-scanner/releases" || status=1
install_brew_or_hint lychee "https://github.com/lycheeverse/lychee/releases" || status=1

if ! need semgrep; then
  echo "Installing semgrep..."
  if need brew && brew install semgrep; then :
  elif need pipx && pipx install semgrep; then :
  elif need pip3 && pip3 install --user semgrep; then :
  else
    echo "Could not auto-install semgrep — see https://semgrep.dev/docs/getting-started"
    status=1
  fi
fi

echo ""
echo "Installing npm dependencies..."
pnpm install

echo ""
if [ "$status" -eq 0 ]; then
  echo "All tools ready. Run 'pnpm run check:all' to verify."
else
  echo "Some tools could not be installed automatically — see messages above."
fi
exit "$status"
