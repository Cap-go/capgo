import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectIosBundleIds, parseInfoPlistBundleId, parsePbxprojBundleId } from '../src/build/onboarding/bundle-id-detector.ts'

function t(name, fn) {
  try {
    fn()
    process.stdout.write(`✓ ${name}\n`)
  }
  catch (e) {
    process.stderr.write(`✗ ${name}\n`)
    throw e
  }
}

// ─── parsePbxprojBundleId ─────────────────────────────────────────────

t('parsePbxprojBundleId returns null for empty content', () => {
  assert.equal(parsePbxprojBundleId(''), null)
})

t('parsePbxprojBundleId returns null when no PRODUCT_BUNDLE_IDENTIFIER is set', () => {
  const noBundle = `
    1A2B3C /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = { OTHER_SETTING = foo; };
      name = Release;
    };
  `
  assert.equal(parsePbxprojBundleId(noBundle), null)
})

t('parsePbxprojBundleId returns the Release bundle id', () => {
  const pbxproj = `
    1A2B3C /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.example;
      };
      name = Release;
    };
    1D2E3F /* Debug */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.example.debug;
      };
      name = Debug;
    };
  `
  const result = parsePbxprojBundleId(pbxproj)
  assert.deepEqual(result, {
    value: 'ee.forgr.example',
    source: 'pbxproj-release',
    label: 'project.pbxproj (Release config)',
  })
})

t('parsePbxprojBundleId tolerates quoted values', () => {
  // Bundle IDs don't legally contain whitespace, but Xcode still quotes the
  // value in pbxproj output. Make sure the regex strips quotes.
  const pbxproj = `
    A /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = "ee.forgr.example";
      };
      name = Release;
    };
  `
  const result = parsePbxprojBundleId(pbxproj)
  assert.equal(result?.value, 'ee.forgr.example')
})

t('parsePbxprojBundleId skips $(PRODUCT_BUNDLE_IDENTIFIER) variable references', () => {
  const pbxproj = `
    A /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = "$(PRODUCT_BUNDLE_IDENTIFIER:rfc1034identifier)";
      };
      name = Release;
    };
    B /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.real;
      };
      name = Release;
    };
  `
  const result = parsePbxprojBundleId(pbxproj)
  assert.equal(result?.value, 'ee.forgr.real')
})

t('parsePbxprojBundleId picks the shortest Release id when extensions are present', () => {
  // The main app target uses ee.forgr.example; an extension uses
  // ee.forgr.example.notif. We want the parent (shorter) for the
  // confirm-app-id step.
  const pbxproj = `
    A /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.example.notif;
      };
      name = Release;
    };
    B /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.example;
      };
      name = Release;
    };
  `
  const result = parsePbxprojBundleId(pbxproj)
  assert.equal(result?.value, 'ee.forgr.example')
})

t('parsePbxprojBundleId falls back to non-Release when no Release config exists', () => {
  const pbxproj = `
    A /* Debug */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.debug;
      };
      name = Debug;
    };
  `
  const result = parsePbxprojBundleId(pbxproj)
  assert.deepEqual(result, {
    value: 'ee.forgr.debug',
    source: 'pbxproj-fallback',
    label: 'project.pbxproj (Debug config)',
  })
})

// ─── parseInfoPlistBundleId ───────────────────────────────────────────

t('parseInfoPlistBundleId returns null for empty content', () => {
  assert.equal(parseInfoPlistBundleId(''), null)
})

t('parseInfoPlistBundleId returns null when CFBundleIdentifier is absent', () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>App</string>
</dict></plist>`
  assert.equal(parseInfoPlistBundleId(plist), null)
})

t('parseInfoPlistBundleId returns the literal CFBundleIdentifier value', () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>ee.forgr.example</string>
</dict></plist>`
  const result = parseInfoPlistBundleId(plist)
  assert.deepEqual(result, {
    value: 'ee.forgr.example',
    source: 'plist',
    label: 'Info.plist (CFBundleIdentifier)',
  })
})

t('parseInfoPlistBundleId skips $(PRODUCT_BUNDLE_IDENTIFIER) placeholder', () => {
  // This is the Capacitor default — useless as a candidate because it just
  // delegates to pbxproj. Returning null lets the picker omit it entirely.
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
</dict></plist>`
  assert.equal(parseInfoPlistBundleId(plist), null)
})

// ─── detectIosBundleIds ────────────────────────────────────────────────

t('detectIosBundleIds returns just capacitor when no iOS project exists', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bundle-id-detect-'))
  try {
    const result = detectIosBundleIds({
      cwd: tmp,
      iosDir: 'ios',
      capacitorAppId: 'com.example.app',
    })
    assert.equal(result.pbxproj, null)
    assert.equal(result.plist, null)
    assert.equal(result.capacitor.value, 'com.example.app')
    assert.equal(result.recommended.value, 'com.example.app')
    assert.equal(result.mismatch, false)
    assert.equal(result.candidates.length, 1)
  }
  finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

t('detectIosBundleIds picks pbxproj over capacitor when they disagree', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bundle-id-detect-'))
  try {
    const xcodeDir = join(tmp, 'ios', 'App.xcodeproj')
    mkdirSync(xcodeDir, { recursive: true })
    writeFileSync(join(xcodeDir, 'project.pbxproj'), `
      A /* Release */ = {
        isa = XCBuildConfiguration;
        buildSettings = {
          PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.real;
        };
        name = Release;
      };
    `, 'utf-8')

    const result = detectIosBundleIds({
      cwd: tmp,
      iosDir: 'ios',
      // Capgo-generated dev-tunnel-suffixed capacitor appId
      capacitorAppId: 'ee.forgr.real.dev-abcd-efgh-ijkl',
    })

    assert.equal(result.pbxproj?.value, 'ee.forgr.real')
    assert.equal(result.recommended.source, 'pbxproj-release')
    assert.equal(result.recommended.value, 'ee.forgr.real')
    assert.equal(result.mismatch, true)
    // pbxproj first (recommended), capacitor second
    assert.equal(result.candidates[0].source, 'pbxproj-release')
    assert.equal(result.candidates[1].source, 'capacitor-config')
  }
  finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

t('detectIosBundleIds reports no mismatch when pbxproj and capacitor agree', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bundle-id-detect-'))
  try {
    const xcodeDir = join(tmp, 'ios', 'App.xcodeproj')
    mkdirSync(xcodeDir, { recursive: true })
    writeFileSync(join(xcodeDir, 'project.pbxproj'), `
      A /* Release */ = {
        isa = XCBuildConfiguration;
        buildSettings = {
          PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.same;
        };
        name = Release;
      };
    `, 'utf-8')

    const result = detectIosBundleIds({
      cwd: tmp,
      iosDir: 'ios',
      capacitorAppId: 'ee.forgr.same',
    })

    assert.equal(result.mismatch, false)
    // Deduplicated — pbxproj and capacitor are the same value, so only one candidate
    assert.equal(result.candidates.length, 1)
  }
  finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

t('detectIosBundleIds reads Info.plist when pbxproj is missing', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bundle-id-detect-'))
  try {
    const appDir = join(tmp, 'ios', 'App', 'App')
    mkdirSync(appDir, { recursive: true })
    writeFileSync(join(appDir, 'Info.plist'), `<?xml version="1.0"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>ee.forgr.fromplist</string>
</dict></plist>`, 'utf-8')

    const result = detectIosBundleIds({
      cwd: tmp,
      iosDir: 'ios',
      capacitorAppId: 'ee.forgr.different',
    })

    assert.equal(result.pbxproj, null)
    assert.equal(result.plist?.value, 'ee.forgr.fromplist')
    assert.equal(result.recommended.source, 'plist')
    assert.equal(result.mismatch, true)
  }
  finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

t('detectIosBundleIds tolerates an Info.plist that delegates to pbxproj variable', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bundle-id-detect-'))
  try {
    const appDir = join(tmp, 'ios', 'App', 'App')
    mkdirSync(appDir, { recursive: true })
    // Default Capacitor template — Info.plist uses the pbxproj variable
    writeFileSync(join(appDir, 'Info.plist'), `<?xml version="1.0"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
</dict></plist>`, 'utf-8')

    const xcodeDir = join(tmp, 'ios', 'App.xcodeproj')
    mkdirSync(xcodeDir, { recursive: true })
    writeFileSync(join(xcodeDir, 'project.pbxproj'), `
      A /* Release */ = {
        isa = XCBuildConfiguration;
        buildSettings = { PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.pbx; };
        name = Release;
      };
    `, 'utf-8')

    const result = detectIosBundleIds({
      cwd: tmp,
      iosDir: 'ios',
      capacitorAppId: 'ee.forgr.cap',
    })

    // pbxproj wins, plist placeholder ignored
    assert.equal(result.plist, null)
    assert.equal(result.recommended.value, 'ee.forgr.pbx')
    assert.equal(result.candidates.length, 2)  // pbxproj + capacitor
  }
  finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

t('detectIosBundleIds finds pbxproj at the root when no ios/ subdir exists', () => {
  // Some React Native / non-Capacitor layouts put .xcodeproj directly at
  // the project root. The existing findXcodeProject() helper supports
  // both — this test pins the contract.
  const tmp = mkdtempSync(join(tmpdir(), 'bundle-id-detect-'))
  try {
    const xcodeDir = join(tmp, 'App.xcodeproj')
    mkdirSync(xcodeDir, { recursive: true })
    writeFileSync(join(xcodeDir, 'project.pbxproj'), `
      A /* Release */ = {
        isa = XCBuildConfiguration;
        buildSettings = { PRODUCT_BUNDLE_IDENTIFIER = ee.forgr.rootlevel; };
        name = Release;
      };
    `, 'utf-8')

    const result = detectIosBundleIds({
      cwd: tmp,
      iosDir: 'ios',  // doesn't exist
      capacitorAppId: 'ee.forgr.cap',
    })

    assert.equal(result.pbxproj?.value, 'ee.forgr.rootlevel')
    assert.equal(result.mismatch, true)
  }
  finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

console.log('OK')
