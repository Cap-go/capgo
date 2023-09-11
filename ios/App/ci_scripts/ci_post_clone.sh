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

# Install yarn
echo "📦 Install pnpm"
brew install pnpm 

# Install dependencies
echo "📦 Install dependencies"
pnpm install --frozen-lockfile

# create assets
echo "🌆 Create Assets"
pnpm run capacitor-assets

# Build the app
echo "🚀 Build code"
pnpm run mobile

# install native dependencies
echo "📦 Install native dependencies "
pnpm run sync:ios
pod install
