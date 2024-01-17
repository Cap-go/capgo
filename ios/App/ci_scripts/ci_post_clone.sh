#!/usr/bin/env bash

set -x

export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
# Install CocoaPods
echo "📦 Install CocoaPods"
brew install cocoapods
brew install node@20
brew link node@20
node -v
npm -v

# Install bun
echo "📦 Install bun"
brew tap oven-sh/bun
brew install bun 

# Install dependencies
echo "📦 Install dependencies"
bun install --frozen-lockfile

# create assets
echo "🌆 Create Assets"
bun run capacitor-assets

# Build the app
echo "🚀 Build code"
bun run mobile

# install native dependencies
echo "📦 Install native dependencies "
bun run sync:ios
pod install
