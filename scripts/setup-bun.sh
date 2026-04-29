#!/usr/bin/env bash

set -euo pipefail

curl -fsSL https://bun.sh/install | bash
echo "$HOME/.bun/bin" >> "$GITHUB_PATH"
export PATH="$HOME/.bun/bin:$PATH"

bun --version
