#!/usr/bin/env bash
# Install the Claude Code skill into ~/.claude/skills/repo-all-sync.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="${1:-$HOME/.claude/skills/repo-all-sync}"
mkdir -p "$dest"
cp "$here/SKILL.md" "$here/tokens.env.example" "$dest"/
if [[ ! -f "$dest/tokens.env" ]]; then
  cp "$here/tokens.env.example" "$dest/tokens.env"
  chmod 600 "$dest/tokens.env"
  echo "created $dest/tokens.env (mode 600); fill in the tokens"
fi
echo "installed to $dest"
