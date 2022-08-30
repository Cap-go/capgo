#!/usr/bin/env bash

echo "POST CLONE"
set -x

export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
brew install cocoapods
# have to add node yourself
brew install node@16
# link it to the path
brew link node@16

brew install pnpm

# Install dependencies
pnpm install --frozen-lockfile
npm run mobile
npx cap sync