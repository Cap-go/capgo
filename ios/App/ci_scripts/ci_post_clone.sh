
#!/usr/bin/env bash

set -e
set -x

export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
# Install CocoaPods
echo "📦 Install CocoaPods"
brew install cocoapods
brew install node@18
brew install vips
brew link node@18

# Install node-gyp (idk why this is required)
npm install -g node-gyp

node -v
npm -v

# Install bun
echo "📦 Install bun"
brew tap oven-sh/bun
brew install bun 
bun -v

echo "Move to the project root"
echo $PWD
cd ../../..
echo $PWD

# Install dependencies
echo "📦 Install dependencies"
bun install

# create assets
echo "🌆 Create Assets"
npm run capacitor-assets

# Build the app
echo "🚀 Build code"
npm run mobile

# install native dependencies
echo "📦 Install native dependencies"
npm run sync:ios


echo "Move back to the ci_scripts directory"
cd ios/App/ci_scripts
