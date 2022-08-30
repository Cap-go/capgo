#!/bin/sh
set -e

# Install CocoaPods and yarn using Homebrew.
brew install cocoapods
brew install node@16
brew link node@16
brew install pnpm

# Install dependencies
pnpm i
npm run mobile
npx cap sync