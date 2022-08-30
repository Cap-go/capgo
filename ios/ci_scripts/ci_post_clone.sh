#!/bin/sh

# Install CocoaPods and yarn using Homebrew.
brew install cocoapods
brew install pnpm

# Install dependencies
pnpm i
npm run mobile
npx cap sync