#!/bin/bash
# Setup real test projects with different package managers and monorepo structures
# This script creates real projects and runs actual installs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR"
PACKAGE_NAME="@capgo/capacitor-updater"
PACKAGE_VERSION="6.25.5"

echo "🧹 Cleaning up old fixtures..."
rm -rf "$FIXTURES_DIR/npm-project"
rm -rf "$FIXTURES_DIR/yarn-project"
rm -rf "$FIXTURES_DIR/pnpm-project"
rm -rf "$FIXTURES_DIR/bun-project"
rm -rf "$FIXTURES_DIR/yarn-workspaces"
rm -rf "$FIXTURES_DIR/pnpm-workspaces"
rm -rf "$FIXTURES_DIR/pnpm-catalog"
rm -rf "$FIXTURES_DIR/npm-workspaces"
rm -rf "$FIXTURES_DIR/turborepo"
rm -rf "$FIXTURES_DIR/nx-monorepo"
rm -rf "$FIXTURES_DIR/lerna-monorepo"

# ============================================================================
# 1. NPM Standard Project
# ============================================================================
echo ""
echo "📦 Creating npm project..."
mkdir -p "$FIXTURES_DIR/npm-project"
cd "$FIXTURES_DIR/npm-project"
cat > package.json << EOF
{
  "name": "npm-test-project",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
npm install --silent
echo "   ✓ npm project created"

# ============================================================================
# 2. Yarn Standard Project
# ============================================================================
echo ""
echo "🧶 Creating yarn project..."
mkdir -p "$FIXTURES_DIR/yarn-project"
cd "$FIXTURES_DIR/yarn-project"
cat > package.json << EOF
{
  "name": "yarn-test-project",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
yarn install --silent 2>/dev/null || yarn add
echo "   ✓ yarn project created"

# ============================================================================
# 3. pnpm Standard Project
# ============================================================================
echo ""
echo "📀 Creating pnpm project..."
mkdir -p "$FIXTURES_DIR/pnpm-project"
cd "$FIXTURES_DIR/pnpm-project"
cat > package.json << EOF
{
  "name": "pnpm-test-project",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
pnpm install --silent 2>/dev/null || pnpm install
echo "   ✓ pnpm project created"

# ============================================================================
# 4. Bun Standard Project
# ============================================================================
echo ""
echo "🥯 Creating bun project..."
mkdir -p "$FIXTURES_DIR/bun-project"
cd "$FIXTURES_DIR/bun-project"
cat > package.json << EOF
{
  "name": "bun-test-project",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
bun install --silent 2>/dev/null || bun install
echo "   ✓ bun project created"

# ============================================================================
# 5. Yarn Workspaces Monorepo
# ============================================================================
echo ""
echo "🧶 Creating yarn workspaces monorepo..."
mkdir -p "$FIXTURES_DIR/yarn-workspaces/apps/mobile"
cd "$FIXTURES_DIR/yarn-workspaces"
cat > package.json << EOF
{
  "name": "yarn-workspaces-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["apps/*"]
}
EOF
cat > apps/mobile/package.json << EOF
{
  "name": "@myorg/mobile",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
yarn install --silent 2>/dev/null || yarn install
echo "   ✓ yarn workspaces monorepo created"

# ============================================================================
# 6. pnpm Workspaces Monorepo
# ============================================================================
echo ""
echo "📀 Creating pnpm workspaces monorepo..."
mkdir -p "$FIXTURES_DIR/pnpm-workspaces/apps/mobile"
cd "$FIXTURES_DIR/pnpm-workspaces"
cat > package.json << EOF
{
  "name": "pnpm-workspaces-monorepo",
  "version": "1.0.0",
  "private": true
}
EOF
cat > pnpm-workspace.yaml << EOF
packages:
  - 'apps/*'
EOF
cat > apps/mobile/package.json << EOF
{
  "name": "@myorg/mobile",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
pnpm install --silent 2>/dev/null || pnpm install
echo "   ✓ pnpm workspaces monorepo created"

# ============================================================================
# 6b. pnpm Workspaces with Catalog (catalog: specifier)
# ============================================================================
echo ""
echo "📀 Creating pnpm workspaces with catalog..."
mkdir -p "$FIXTURES_DIR/pnpm-catalog/apps/mobile"
cd "$FIXTURES_DIR/pnpm-catalog"
cat > package.json << EOF
{
  "name": "pnpm-catalog-monorepo",
  "version": "1.0.0",
  "private": true
}
EOF
cat > pnpm-workspace.yaml << EOF
packages:
  - 'apps/*'

catalog:
  '@capgo/capacitor-updater': ^$PACKAGE_VERSION
EOF
cat > apps/mobile/package.json << EOF
{
  "name": "@myorg/mobile",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "catalog:"
  }
}
EOF
pnpm install --silent 2>/dev/null || pnpm install
echo "   ✓ pnpm catalog monorepo created"

# ============================================================================
# 7. npm Workspaces Monorepo
# ============================================================================
echo ""
echo "📦 Creating npm workspaces monorepo..."
mkdir -p "$FIXTURES_DIR/npm-workspaces/apps/mobile"
cd "$FIXTURES_DIR/npm-workspaces"
cat > package.json << EOF
{
  "name": "npm-workspaces-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["apps/*"]
}
EOF
cat > apps/mobile/package.json << EOF
{
  "name": "@myorg/mobile",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
npm install --silent
echo "   ✓ npm workspaces monorepo created"

# ============================================================================
# 8. Turborepo Monorepo
# ============================================================================
echo ""
echo "🚀 Creating turborepo monorepo..."
mkdir -p "$FIXTURES_DIR/turborepo/apps/mobile"
cd "$FIXTURES_DIR/turborepo"
cat > package.json << EOF
{
  "name": "turborepo-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
EOF
cat > turbo.json << EOF
{
  "\$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {}
  }
}
EOF
cat > apps/mobile/package.json << EOF
{
  "name": "@myorg/mobile",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
npm install --silent
echo "   ✓ turborepo monorepo created"

# ============================================================================
# 9. Nx Monorepo
# ============================================================================
echo ""
echo "🔷 Creating nx monorepo..."
mkdir -p "$FIXTURES_DIR/nx-monorepo/apps/mobile"
cd "$FIXTURES_DIR/nx-monorepo"
cat > package.json << EOF
{
  "name": "nx-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["apps/*", "libs/*"]
}
EOF
cat > nx.json << EOF
{
  "\$schema": "./node_modules/nx/schemas/nx-schema.json",
  "npmScope": "myorg"
}
EOF
cat > apps/mobile/package.json << EOF
{
  "name": "@myorg/mobile",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
npm install --silent
echo "   ✓ nx monorepo created"

# ============================================================================
# 10. Lerna Monorepo
# ============================================================================
echo ""
echo "🐉 Creating lerna monorepo..."
mkdir -p "$FIXTURES_DIR/lerna-monorepo/packages/mobile"
cd "$FIXTURES_DIR/lerna-monorepo"
cat > package.json << EOF
{
  "name": "lerna-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["packages/*"]
}
EOF
cat > lerna.json << EOF
{
  "\$schema": "node_modules/lerna/schemas/lerna-schema.json",
  "version": "independent",
  "packages": ["packages/*"]
}
EOF
cat > packages/mobile/package.json << EOF
{
  "name": "@myorg/mobile",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
npm install --silent
echo "   ✓ lerna monorepo created"

# ============================================================================
# EDGE CASES: Version Mismatch Traps
# These test that we read from node_modules, NOT package.json
# ============================================================================

# ============================================================================
# 11. Version Mismatch: package.json says old, node_modules has new
# This simulates: user has ^6.14.10 in package.json but 6.30.0 installed
# ============================================================================
echo ""
echo "🎭 Creating version mismatch trap (package.json lies)..."
mkdir -p "$FIXTURES_DIR/version-mismatch"
cd "$FIXTURES_DIR/version-mismatch"
# First install the real package
cat > package.json << EOF
{
  "name": "version-mismatch-project",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
npm install --silent
# Now change package.json to LIE about the version (old version)
cat > package.json << EOF
{
  "name": "version-mismatch-project",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^6.14.10"
  }
}
EOF
echo "   ✓ version mismatch trap created (package.json says 6.14.10, node_modules has latest)"

# ============================================================================
# 12. Fake nested package.json: Wrong version in a nested fake location
# This tests that we don't get tricked by a fake package.json in wrong place
# ============================================================================
echo ""
echo "🎭 Creating wrong nested version trap..."
mkdir -p "$FIXTURES_DIR/wrong-nested-version"
cd "$FIXTURES_DIR/wrong-nested-version"
cat > package.json << EOF
{
  "name": "wrong-nested-project",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
npm install --silent
# Create a FAKE package.json in a wrong location that has wrong version
mkdir -p "src/@capgo/capacitor-updater"
cat > "src/@capgo/capacitor-updater/package.json" << EOF
{
  "name": "@capgo/capacitor-updater",
  "version": "1.0.0-FAKE"
}
EOF
echo "   ✓ wrong nested version trap created (fake 1.0.0-FAKE in src/, real in node_modules)"

# ============================================================================
# 13. Monorepo with different versions: root and app have different versions
# This tests that we get the correct version from the app's context
# ============================================================================
echo ""
echo "🎭 Creating monorepo different versions trap..."
mkdir -p "$FIXTURES_DIR/fake-version-trap/apps/mobile"
cd "$FIXTURES_DIR/fake-version-trap"
# Only the app has the dependency - this is the common case
cat > package.json << EOF
{
  "name": "fake-version-trap-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["apps/*"]
}
EOF
cat > apps/mobile/package.json << EOF
{
  "name": "@myorg/mobile",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^$PACKAGE_VERSION"
  }
}
EOF
# Install - npm workspaces will hoist to root
npm install --silent
# Now manually edit app's package.json to claim an old version (LIE)
cat > apps/mobile/package.json << EOF
{
  "name": "@myorg/mobile",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "$PACKAGE_NAME": "^6.14.10"
  }
}
EOF
echo "   ✓ monorepo fake version trap created (app package.json lies, node_modules has real)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All test fixtures created successfully!"
echo ""
echo "Fixtures created:"
echo "  Package Managers:"
echo "    - $FIXTURES_DIR/npm-project"
echo "    - $FIXTURES_DIR/yarn-project"
echo "    - $FIXTURES_DIR/pnpm-project"
echo "    - $FIXTURES_DIR/bun-project"
echo ""
echo "  Monorepos:"
echo "    - $FIXTURES_DIR/yarn-workspaces"
echo "    - $FIXTURES_DIR/pnpm-workspaces"
echo "    - $FIXTURES_DIR/pnpm-catalog"
echo "    - $FIXTURES_DIR/npm-workspaces"
echo "    - $FIXTURES_DIR/turborepo"
echo "    - $FIXTURES_DIR/nx-monorepo"
echo "    - $FIXTURES_DIR/lerna-monorepo"
echo ""
echo "  Edge Case Traps:"
echo "    - $FIXTURES_DIR/version-mismatch (package.json lies about version)"
echo "    - $FIXTURES_DIR/wrong-nested-version (fake package.json in src/)"
echo "    - $FIXTURES_DIR/fake-version-trap (monorepo with lying package.json)"
echo ""
echo "Run tests with: bun run test:version-detection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
