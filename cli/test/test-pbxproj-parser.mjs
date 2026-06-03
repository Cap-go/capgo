import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { findSignableTargets, findXcodeProject, replaceBundleIdInPbxproj, writeReleaseBundleId } from '../src/build/pbxproj-parser.ts'

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`\u2713 ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`\u2717 ${name}\n`)
    throw e
  }
}

const samplePbxproj = `// !$*UTF8*$!
{
  archiveVersion = 1;
  objectVersion = 56;
  objects = {
    13B07F861A680F5B00A75B9A /* App */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = 13B07F931A680F5B00A75B9A;
      name = App;
      productName = App;
      productType = "com.apple.product-type.application";
    };
    AA11BB22CC33DD44 /* ShareExtension */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = AA11BB22CC33DD55;
      name = ShareExtension;
      productName = ShareExtension;
      productType = "com.apple.product-type.app-extension";
    };
    FF00FF00FF00FF00 /* UnitTests */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = FF00FF00FF00FF11;
      name = UnitTests;
      productName = UnitTests;
      productType = "com.apple.product-type.bundle.unit-test";
    };
    13B07F931A680F5B00A75B9A /* Build configuration list for App */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        13B07F941A680F5B00A75B9A,
      );
    };
    13B07F941A680F5B00A75B9A /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = "com.example.myapp";
        INFOPLIST_FILE = App/Info.plist;
      };
      name = Release;
    };
    AA11BB22CC33DD55 /* Build configuration list for ShareExtension */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        AA11BB22CC33DD66,
      );
    };
    AA11BB22CC33DD66 /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = "com.example.myapp.ShareExtension";
        INFOPLIST_FILE = ShareExtension/Info.plist;
      };
      name = Release;
    };
  };
  rootObject = 089C1665FE841187C02AAC07;
}`

t('finds app and extension targets, ignores unit-test target', () => {
  const targets = findSignableTargets(samplePbxproj)

  assert.equal(targets.length, 2)

  const app = targets.find(t => t.name === 'App')
  assert.ok(app, 'should find App target')
  assert.equal(app.bundleId, 'com.example.myapp')
  assert.equal(app.productType, 'com.apple.product-type.application')

  const ext = targets.find(t => t.name === 'ShareExtension')
  assert.ok(ext, 'should find ShareExtension target')
  assert.equal(ext.bundleId, 'com.example.myapp.ShareExtension')
  assert.equal(ext.productType, 'com.apple.product-type.app-extension')
})

t('returns empty array for empty content', () => {
  const targets = findSignableTargets('')
  assert.deepEqual(targets, [])
})

t('findXcodeProject finds .xcodeproj in ios/ subdirectory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbx-test-'))
  try {
    const xcodeprojDir = join(dir, 'ios', 'MyApp.xcodeproj')
    mkdirSync(xcodeprojDir, { recursive: true })
    writeFileSync(join(xcodeprojDir, 'project.pbxproj'), 'fake content')

    const result = findXcodeProject(dir)
    assert.equal(result, join(xcodeprojDir, 'project.pbxproj'))
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

t('findXcodeProject finds .xcodeproj nested under ios/App (Capacitor layout)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbx-test-'))
  try {
    // Capacitor nests the project at ios/App/App.xcodeproj — one level deeper
    // than the React Native ios/MyApp.xcodeproj layout the first test covers.
    const xcodeprojDir = join(dir, 'ios', 'App', 'App.xcodeproj')
    mkdirSync(xcodeprojDir, { recursive: true })
    writeFileSync(join(xcodeprojDir, 'project.pbxproj'), 'fake content')

    const result = findXcodeProject(dir)
    assert.equal(result, join(xcodeprojDir, 'project.pbxproj'))
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// --- resolveBundleId prefers Release over Debug ---

const debugReleasePbxproj = `// !$*UTF8*$!
{
  archiveVersion = 1;
  objectVersion = 56;
  objects = {
    AABB0011 /* App */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = AABB0022;
      name = App;
      productName = App;
      productType = "com.apple.product-type.application";
    };
    AABB0022 /* Build configuration list for App */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        AABB0033,
        AABB0044,
      );
    };
    AABB0033 /* Debug */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = "com.example.debug";
        INFOPLIST_FILE = App/Info.plist;
      };
      name = Debug;
    };
    AABB0044 /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = "com.example.release";
        INFOPLIST_FILE = App/Info.plist;
      };
      name = Release;
    };
  };
  rootObject = 089C1665FE841187C02AAC07;
}`

t('prefers Release bundle ID over Debug when both exist', () => {
  const targets = findSignableTargets(debugReleasePbxproj)
  assert.equal(targets.length, 1)
  assert.equal(targets[0].bundleId, 'com.example.release')
})

// Debug listed first but Release should still win
const debugFirstPbxproj = `// !$*UTF8*$!
{
  archiveVersion = 1;
  objectVersion = 56;
  objects = {
    CC110011 /* App */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = CC110022;
      name = App;
      productName = App;
      productType = "com.apple.product-type.application";
    };
    CC110022 /* Build configuration list for App */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        CC110033,
        CC110044,
      );
    };
    CC110033 /* Debug */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = "com.example.app.debug";
        INFOPLIST_FILE = App/Info.plist;
      };
      name = Debug;
    };
    CC110044 /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = "com.example.app";
        INFOPLIST_FILE = App/Info.plist;
      };
      name = Release;
    };
  };
  rootObject = 089C1665FE841187C02AAC07;
}`

t('picks Release even when Debug is listed first in buildConfigurations', () => {
  const targets = findSignableTargets(debugFirstPbxproj)
  assert.equal(targets.length, 1)
  assert.equal(targets[0].bundleId, 'com.example.app')
})

// Only Debug config present — should fall back to it
const debugOnlyPbxproj = `// !$*UTF8*$!
{
  archiveVersion = 1;
  objectVersion = 56;
  objects = {
    DD110011 /* App */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = DD110022;
      name = App;
      productName = App;
      productType = "com.apple.product-type.application";
    };
    DD110022 /* Build configuration list for App */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        DD110033,
      );
    };
    DD110033 /* Debug */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = "com.example.debugonly";
        INFOPLIST_FILE = App/Info.plist;
      };
      name = Debug;
    };
  };
  rootObject = 089C1665FE841187C02AAC07;
}`

t('falls back to Debug bundle ID when no Release config exists', () => {
  const targets = findSignableTargets(debugOnlyPbxproj)
  assert.equal(targets.length, 1)
  assert.equal(targets[0].bundleId, 'com.example.debugonly')
})

t('findXcodeProject returns null when no .xcodeproj exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbx-test-'))
  try {
    mkdirSync(join(dir, 'ios'), { recursive: true })

    const result = findXcodeProject(dir)
    assert.equal(result, null)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── replaceBundleIdInPbxproj (pure rewriter) ──────────────────────────

t('replaceBundleIdInPbxproj replaces an unquoted value', () => {
  const { content, changed } = replaceBundleIdInPbxproj('PRODUCT_BUNDLE_IDENTIFIER = com.foo.old;', 'com.foo.old', 'com.foo.new')
  assert.equal(changed, 1)
  assert.equal(content, 'PRODUCT_BUNDLE_IDENTIFIER = com.foo.new;')
})

t('replaceBundleIdInPbxproj replaces a quoted value (normalizes to unquoted)', () => {
  const { content, changed } = replaceBundleIdInPbxproj('PRODUCT_BUNDLE_IDENTIFIER = "com.foo.old";', 'com.foo.old', 'com.foo.new')
  assert.equal(changed, 1)
  assert.equal(content, 'PRODUCT_BUNDLE_IDENTIFIER = com.foo.new;')
})

t('replaceBundleIdInPbxproj updates every matching occurrence (Debug + Release share the value)', () => {
  const input = [
    '\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.foo.app;',
    '\t\t\tname = Debug;',
    '\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.foo.app;',
    '\t\t\tname = Release;',
  ].join('\n')
  const { content, changed } = replaceBundleIdInPbxproj(input, 'com.foo.app', 'com.foo.real')
  assert.equal(changed, 2)
  assert.equal(content.includes('com.foo.app;'), false)
  assert.equal((content.match(/com\.foo\.real/g) || []).length, 2)
})

t('replaceBundleIdInPbxproj only touches the matching value (different Debug id is left alone)', () => {
  const input = [
    'PRODUCT_BUNDLE_IDENTIFIER = com.foo.app;',
    'PRODUCT_BUNDLE_IDENTIFIER = com.foo.app.release.build;',
  ].join('\n')
  const { content, changed } = replaceBundleIdInPbxproj(input, 'com.foo.app.release.build', 'com.foo.real')
  assert.equal(changed, 1)
  assert.equal(content.includes('com.foo.app.release.build'), false)
  assert.equal(content.includes('PRODUCT_BUNDLE_IDENTIFIER = com.foo.app;'), true)
  assert.equal(content.includes('PRODUCT_BUNDLE_IDENTIFIER = com.foo.real;'), true)
})

t('replaceBundleIdInPbxproj does NOT touch suffixed extension ids', () => {
  const input = [
    'PRODUCT_BUNDLE_IDENTIFIER = com.foo.app;',
    'PRODUCT_BUNDLE_IDENTIFIER = com.foo.app.notif;',
  ].join('\n')
  const { content, changed } = replaceBundleIdInPbxproj(input, 'com.foo.app', 'com.foo.real')
  assert.equal(changed, 1)
  assert.equal(content.includes('com.foo.app.notif'), true)
})

t('replaceBundleIdInPbxproj is a no-op when the value is absent', () => {
  const input = 'PRODUCT_BUNDLE_IDENTIFIER = com.foo.other;'
  const { content, changed } = replaceBundleIdInPbxproj(input, 'com.foo.missing', 'com.foo.new')
  assert.equal(changed, 0)
  assert.equal(content, input)
})

t('replaceBundleIdInPbxproj is a no-op when from === to', () => {
  const input = 'PRODUCT_BUNDLE_IDENTIFIER = com.foo.app;'
  const { content, changed } = replaceBundleIdInPbxproj(input, 'com.foo.app', 'com.foo.app')
  assert.equal(changed, 0)
  assert.equal(content, input)
})

// ── writeReleaseBundleId (read-modify-write) ──────────────────────────

t('writeReleaseBundleId rewrites the pbxproj on disk (Capacitor layout)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbx-test-'))
  try {
    const xcodeprojDir = join(dir, 'ios', 'App', 'App.xcodeproj')
    mkdirSync(xcodeprojDir, { recursive: true })
    const pbxprojPath = join(xcodeprojDir, 'project.pbxproj')
    writeFileSync(pbxprojPath, 'PRODUCT_BUNDLE_IDENTIFIER = com.foo.wrong;\nname = Release;\n')

    const { changed } = writeReleaseBundleId(dir, 'ios', 'com.foo.wrong', 'com.foo.real')
    assert.equal(changed, 1)
    const after = readFileSync(pbxprojPath, 'utf-8')
    assert.equal(after.includes('com.foo.wrong'), false)
    assert.equal(after.includes('PRODUCT_BUNDLE_IDENTIFIER = com.foo.real;'), true)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

t('writeReleaseBundleId returns changed:0 when no project exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbx-test-'))
  try {
    const { changed } = writeReleaseBundleId(dir, 'ios', 'com.foo.wrong', 'com.foo.real')
    assert.equal(changed, 0)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

process.stdout.write('OK\n')
