// test/prescan/checks-android-manifest.test.ts
import { describe, expect, it } from 'bun:test'
import {
  manifestDeeplinkValid,
  manifestDuplicateComponent,
  manifestExportedMissing,
  manifestExportedUnprotected,
  manifestHardcodedDebuggable,
  manifestMissingPrefix,
  manifestMockLocation,
  manifestMultipleUsesSdk,
  manifestNamespaceUri,
  manifestQueryAllPackages,
  manifestTagTypo,
  manifestUniquePermission,
  manifestWellFormed,
} from '../../src/build/prescan/checks/android-manifest'
import { makeCtx, makeProject } from './helpers'

const MANIFEST_PATH = 'android/app/src/main/AndroidManifest.xml'
const aCtx = (dir: string, extra: object = {}) => makeCtx({ projectDir: dir, platform: 'android', ...extra })
const withManifest = (xml: string, extra: Record<string, string> = {}) => makeProject({ [MANIFEST_PATH]: xml, ...extra })

// A clean, well-formed Capacitor-shaped manifest that should pass every check.
const GOOD_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:label="@string/app_name" android:exported="false">
    <activity
      android:name=".MainActivity"
      android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
    <provider
      android:name="androidx.core.content.FileProvider"
      android:authorities="\${applicationId}.fileprovider"
      android:exported="false"
      android:grantUriPermissions="true" />
  </application>
  <uses-permission android:name="android.permission.INTERNET" />
</manifest>`

describe('android/manifest-well-formed', () => {
  it('appliesTo is false when no manifest exists', () => {
    const dir = makeProject({ 'android/app/build.gradle': '' })
    expect(manifestWellFormed.appliesTo!(aCtx(dir))).toBe(false)
  })
  it('appliesTo is true when a manifest exists', () => {
    const dir = withManifest(GOOD_MANIFEST)
    expect(manifestWellFormed.appliesTo!(aCtx(dir))).toBe(true)
  })
  it('passes a well-formed manifest', async () => {
    expect(await manifestWellFormed.run(aCtx(withManifest(GOOD_MANIFEST)))).toEqual([])
  })
  it('errors on two <application> blocks', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A"></application>
      <application android:label="B"></application>
    </manifest>`
    const f = await manifestWellFormed.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.id).toBe('android/manifest-well-formed')
  })
  it('errors on a missing </manifest>', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A"></application>`
    const f = await manifestWellFormed.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('errors on an unclosed <application> (no </application> before </manifest>)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
    </manifest>`
    const f = await manifestWellFormed.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('errors on zero <application> blocks', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"></manifest>`
    const f = await manifestWellFormed.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('ignores a commented-out second <application>', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A"></application>
      <!-- <application android:label="OLD"></application> -->
    </manifest>`
    expect(await manifestWellFormed.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('passes a well-formed manifest whose <application> open tag uses a single-quoted attribute', async () => {
    // Single-quoted attribute values are valid XML; the scanner must not drop
    // the element (which previously yielded a false "found 0 <application>").
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label='Demo' android:exported="false"></application>
    </manifest>`
    expect(await manifestWellFormed.run(aCtx(withManifest(xml)))).toEqual([])
  })
})

describe('android/manifest-tag-typo', () => {
  it('errors on a near-miss tag with a suggestion', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application>
        <activty android:name=".X" />
      </application>
    </manifest>`
    const f = await manifestTagTypo.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title.toLowerCase()).toContain('activty')
    expect(f.some(x => (x.detail ?? x.title).includes('activity'))).toBe(true)
  })
  it('passes a manifest of all-valid tags', async () => {
    expect(await manifestTagTypo.run(aCtx(withManifest(GOOD_MANIFEST)))).toEqual([])
  })
  it('ignores namespaced/custom tags (contain a colon)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application>
        <androidx:fragment android:name=".X" />
      </application>
    </manifest>`
    expect(await manifestTagTypo.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('ignores wildly-different tags (distance > 3)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application>
        <somethingentirelyunrelated android:name=".X" />
      </application>
    </manifest>`
    expect(await manifestTagTypo.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('ignores commented-out typo tags', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application>
        <!-- <activty android:name=".X" /> -->
      </application>
    </manifest>`
    expect(await manifestTagTypo.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('does NOT flag a distance-2/3 near-miss tag (only true single-char typos)', async () => {
    // profile->provider (d=3) and paths->data (d=3) were false blocking errors;
    // they must no longer be flagged.
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application>
        <profile android:name=".X" />
        <paths android:name=".Y" />
      </application>
    </manifest>`
    expect(await manifestTagTypo.run(aCtx(withManifest(xml)))).toEqual([])
  })
})

describe('android/manifest-namespace-uri', () => {
  it('passes the canonical xmlns:android URI', async () => {
    expect(await manifestNamespaceUri.run(aCtx(withManifest(GOOD_MANIFEST)))).toEqual([])
  })
  it('errors when android: attrs are used but xmlns:android is absent', async () => {
    const xml = `<manifest>
      <application android:label="A"></application>
    </manifest>`
    const f = await manifestNamespaceUri.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('errors on a near-miss (wrong) xmlns:android URI', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/androidx">
      <application android:label="A"></application>
    </manifest>`
    const f = await manifestNamespaceUri.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('errors when tools: attrs are used but xmlns:tools is absent', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A" tools:replace="android:label"></application>
    </manifest>`
    const f = await manifestNamespaceUri.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('passes when tools: attrs are used and xmlns:tools is declared', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
      <application android:label="A" tools:replace="android:label"></application>
    </manifest>`
    expect(await manifestNamespaceUri.run(aCtx(withManifest(xml)))).toEqual([])
  })
})

describe('android/manifest-missing-prefix', () => {
  it('passes a fully-prefixed manifest', async () => {
    expect(await manifestMissingPrefix.run(aCtx(withManifest(GOOD_MANIFEST)))).toEqual([])
  })
  it('errors on a bare always-android attribute (exported)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".X" exported="true" />
      </application>
    </manifest>`
    const f = await manifestMissingPrefix.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
    expect(f.some(x => (x.detail ?? x.title).includes('exported'))).toBe(true)
  })
  it('errors on a bare name attribute', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity name=".X" android:exported="true" />
      </application>
    </manifest>`
    const f = await manifestMissingPrefix.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('does not flag an already android:-prefixed attribute', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".X" android:exported="true" />
      </application>
    </manifest>`
    expect(await manifestMissingPrefix.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('does not flag the same name when carried by a foreign prefix (tools:)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
      <application android:label="A">
        <activity android:name=".X" android:exported="true" tools:node="merge" />
      </application>
    </manifest>`
    expect(await manifestMissingPrefix.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('ignores bare attributes in commented-out elements', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <!-- <activity name=".X" exported="true" /> -->
      </application>
    </manifest>`
    expect(await manifestMissingPrefix.run(aCtx(withManifest(xml)))).toEqual([])
  })
})

describe('android/manifest-exported-missing', () => {
  it('errors when an activity with an intent-filter has no android:exported (targetSdk >= 31)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".MainActivity">
          <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
          </intent-filter>
        </activity>
      </application>
    </manifest>`
    const dir = withManifest(xml, { 'android/variables.gradle': 'ext { targetSdkVersion = 34 }' })
    const f = await manifestExportedMissing.run(aCtx(dir))
    expect(f[0]?.severity).toBe('error')
  })
  it('errors when the launcher activity has android:exported="false"', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".MainActivity" android:exported="false">
          <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
          </intent-filter>
        </activity>
      </application>
    </manifest>`
    const dir = withManifest(xml, { 'android/variables.gradle': 'ext { targetSdkVersion = 34 }' })
    const f = await manifestExportedMissing.run(aCtx(dir))
    expect(f[0]?.severity).toBe('error')
  })
  it('passes when every intent-filter component declares exported', async () => {
    const dir = withManifest(GOOD_MANIFEST, { 'android/variables.gradle': 'ext { targetSdkVersion = 34 }' })
    expect(await manifestExportedMissing.run(aCtx(dir))).toEqual([])
  })
  it('treats unknown targetSdk as >= 31 (applies)', () => {
    const dir = withManifest(GOOD_MANIFEST)
    expect(manifestExportedMissing.appliesTo!(aCtx(dir))).toBe(true)
  })
  it('does not apply on a pre-31 target', () => {
    const dir = withManifest(GOOD_MANIFEST, { 'android/variables.gradle': 'ext { targetSdkVersion = 30 }' })
    expect(manifestExportedMissing.appliesTo!(aCtx(dir))).toBe(false)
  })
  it('does not flag a component without an intent-filter', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A" android:exported="false">
        <activity android:name=".MainActivity" android:exported="true">
          <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
          </intent-filter>
        </activity>
        <service android:name=".BgService" />
      </application>
    </manifest>`
    const dir = withManifest(xml, { 'android/variables.gradle': 'ext { targetSdkVersion = 34 }' })
    expect(await manifestExportedMissing.run(aCtx(dir))).toEqual([])
  })
  it('does NOT flag a launcher whose android:exported is a manifest placeholder', async () => {
    // android:exported="${isExported}" is a valid manifestPlaceholders pattern;
    // the unresolved ${...} token must not block the launcher.
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".MainActivity" android:exported="\${isExported}">
          <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
          </intent-filter>
        </activity>
      </application>
    </manifest>`
    const dir = withManifest(xml, { 'android/variables.gradle': 'ext { targetSdkVersion = 34 }' })
    expect(await manifestExportedMissing.run(aCtx(dir))).toEqual([])
  })
})

describe('android/manifest-multiple-uses-sdk', () => {
  it('errors on two <uses-sdk> elements', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <uses-sdk android:minSdkVersion="23" />
      <uses-sdk android:targetSdkVersion="34" />
      <application android:label="A"></application>
    </manifest>`
    const f = await manifestMultipleUsesSdk.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('passes a single <uses-sdk>', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <uses-sdk android:minSdkVersion="23" />
      <application android:label="A"></application>
    </manifest>`
    expect(await manifestMultipleUsesSdk.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('passes zero <uses-sdk> (Capacitor default)', async () => {
    expect(await manifestMultipleUsesSdk.run(aCtx(withManifest(GOOD_MANIFEST)))).toEqual([])
  })
  it('ignores a commented-out second <uses-sdk>', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <uses-sdk android:minSdkVersion="23" />
      <!-- <uses-sdk android:targetSdkVersion="34" /> -->
      <application android:label="A"></application>
    </manifest>`
    expect(await manifestMultipleUsesSdk.run(aCtx(withManifest(xml)))).toEqual([])
  })
})

describe('android/manifest-duplicate-component', () => {
  it('errors on a duplicate activity android:name (relative == absolute)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".MainActivity" android:exported="true" />
        <activity android:name="com.demo.app.MainActivity" android:exported="false" />
      </application>
    </manifest>`
    const dir = withManifest(xml, { 'android/app/build.gradle': `android { defaultConfig { applicationId "com.demo.app" } }` })
    const f = await manifestDuplicateComponent.run(aCtx(dir))
    expect(f[0]?.severity).toBe('error')
  })
  it('does not flag distinct components', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".MainActivity" android:exported="true" />
        <activity android:name=".OtherActivity" android:exported="false" />
      </application>
    </manifest>`
    const dir = withManifest(xml, { 'android/app/build.gradle': `android { defaultConfig { applicationId "com.demo.app" } }` })
    expect(await manifestDuplicateComponent.run(aCtx(dir))).toEqual([])
  })
  it('does not flag the same name across different element types', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".Worker" android:exported="true" />
        <service android:name=".Worker" android:exported="false" />
      </application>
    </manifest>`
    const dir = withManifest(xml, { 'android/app/build.gradle': `android { defaultConfig { applicationId "com.demo.app" } }` })
    expect(await manifestDuplicateComponent.run(aCtx(dir))).toEqual([])
  })
  it('skips when package/applicationId is unresolvable (does not guess)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".MainActivity" android:exported="true" />
        <activity android:name="com.demo.app.MainActivity" android:exported="false" />
      </application>
    </manifest>`
    // no build.gradle applicationId and no package= attribute => unresolvable
    expect(await manifestDuplicateComponent.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('flags two identical absolute names even without a resolvable package', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name="com.demo.app.MainActivity" android:exported="true" />
        <activity android:name="com.demo.app.MainActivity" android:exported="false" />
      </application>
    </manifest>`
    const f = await manifestDuplicateComponent.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
})

describe('android/manifest-unique-permission', () => {
  it('errors on a duplicate custom <permission> name', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <permission android:name="com.demo.app.C2D_MESSAGE" android:protectionLevel="signature" />
      <permission android:name="com.demo.app.C2D_MESSAGE" android:protectionLevel="signature" />
      <application android:label="A"></application>
    </manifest>`
    const f = await manifestUniquePermission.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('does not flag duplicate uses-permission (harmless)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <uses-permission android:name="android.permission.INTERNET" />
      <uses-permission android:name="android.permission.INTERNET" />
      <application android:label="A"></application>
    </manifest>`
    expect(await manifestUniquePermission.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('passes distinct custom permissions', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <permission android:name="com.demo.app.A" />
      <permission android:name="com.demo.app.B" />
      <application android:label="A"></application>
    </manifest>`
    expect(await manifestUniquePermission.run(aCtx(withManifest(xml)))).toEqual([])
  })
})

describe('android/manifest-hardcoded-debuggable', () => {
  it('errors on android:debuggable="true"', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A" android:debuggable="true"></application>
    </manifest>`
    const f = await manifestHardcodedDebuggable.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('warns on android:debuggable="false" (redundant)', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A" android:debuggable="false"></application>
    </manifest>`
    const f = await manifestHardcodedDebuggable.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('warning')
  })
  it('passes when debuggable is absent', async () => {
    expect(await manifestHardcodedDebuggable.run(aCtx(withManifest(GOOD_MANIFEST)))).toEqual([])
  })
})

describe('android/manifest-mock-location', () => {
  it('errors on ACCESS_MOCK_LOCATION', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <uses-permission android:name="android.permission.ACCESS_MOCK_LOCATION" />
      <application android:label="A"></application>
    </manifest>`
    const f = await manifestMockLocation.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('error')
  })
  it('passes a manifest without the mock-location permission', async () => {
    expect(await manifestMockLocation.run(aCtx(withManifest(GOOD_MANIFEST)))).toEqual([])
  })
})

describe('android/manifest-exported-unprotected', () => {
  it('warns on an exported service with no android:permission', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <service android:name=".BgService" android:exported="true" />
      </application>
    </manifest>`
    const f = await manifestExportedUnprotected.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('warning')
  })
  it('passes an exported service that declares android:permission', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <service android:name=".BgService" android:exported="true" android:permission="com.demo.app.PERM" />
      </application>
    </manifest>`
    expect(await manifestExportedUnprotected.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('does not flag an exported activity', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <activity android:name=".MainActivity" android:exported="true" />
      </application>
    </manifest>`
    expect(await manifestExportedUnprotected.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('does not flag a non-exported service', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <service android:name=".BgService" android:exported="false" />
      </application>
    </manifest>`
    expect(await manifestExportedUnprotected.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('warns on an over-broad grant-uri-permission on an exported provider', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <application android:label="A">
        <provider android:name=".P" android:exported="true" android:grantUriPermissions="true">
          <grant-uri-permission android:path="/" />
        </provider>
      </application>
    </manifest>`
    const f = await manifestExportedUnprotected.run(aCtx(withManifest(xml)))
    expect(f.length).toBeGreaterThan(0)
    expect(f[0]?.severity).toBe('warning')
  })
})

describe('android/manifest-query-all-packages', () => {
  it('warns on QUERY_ALL_PACKAGES with a docs link', async () => {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
      <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
      <application android:label="A"></application>
    </manifest>`
    const f = await manifestQueryAllPackages.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('warning')
    expect(f[0]?.docsUrl).toBeTruthy()
  })
  it('passes a manifest without QUERY_ALL_PACKAGES', async () => {
    expect(await manifestQueryAllPackages.run(aCtx(withManifest(GOOD_MANIFEST)))).toEqual([])
  })
})

describe('android/manifest-deeplink-valid', () => {
  const VIEW_BROWSABLE = (data: string, autoVerify = false) => `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="A">
      <activity android:name=".Deep" android:exported="true">
        <intent-filter${autoVerify ? ' android:autoVerify="true"' : ''}>
          <action android:name="android.intent.action.VIEW" />
          <category android:name="android.intent.category.DEFAULT" />
          <category android:name="android.intent.category.BROWSABLE" />
          ${data}
        </intent-filter>
      </activity>
    </application>
  </manifest>`
  it('does not apply without a VIEW+BROWSABLE intent-filter', () => {
    expect(manifestDeeplinkValid.appliesTo!(aCtx(withManifest(GOOD_MANIFEST)))).toBe(false)
  })
  it('applies when a VIEW+BROWSABLE intent-filter is present', () => {
    const xml = VIEW_BROWSABLE('<data android:scheme="https" android:host="ex.com" />')
    expect(manifestDeeplinkValid.appliesTo!(aCtx(withManifest(xml)))).toBe(true)
  })
  it('passes a valid https deep link with host', async () => {
    const xml = VIEW_BROWSABLE('<data android:scheme="https" android:host="ex.com" />', true)
    expect(await manifestDeeplinkValid.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('warns when autoVerify is set on a non-http(s) scheme', async () => {
    const xml = VIEW_BROWSABLE('<data android:scheme="myapp" android:host="x" />', true)
    const f = await manifestDeeplinkValid.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('warning')
  })
  it('warns when http(s)+autoVerify has no host', async () => {
    const xml = VIEW_BROWSABLE('<data android:scheme="https" />', true)
    const f = await manifestDeeplinkValid.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('warning')
  })
  it('warns on a scheme that fails SCHEME_RE', async () => {
    const xml = VIEW_BROWSABLE('<data android:scheme="1bad_scheme" />')
    const f = await manifestDeeplinkValid.run(aCtx(withManifest(xml)))
    expect(f[0]?.severity).toBe('warning')
  })
  it('passes a valid custom-scheme deep link (no autoVerify, no host required)', async () => {
    const xml = VIEW_BROWSABLE('<data android:scheme="myapp" android:host="open" />')
    expect(await manifestDeeplinkValid.run(aCtx(withManifest(xml)))).toEqual([])
  })
  it('passes the standard split scheme/host App Links pattern (scheme and host in separate <data>)', async () => {
    // Android docs recommend splitting attributes across sibling <data> tags;
    // aggregating scheme/host across the filter must not false-positive "no host".
    const xml = VIEW_BROWSABLE('<data android:scheme="https" /><data android:host="ex.com" />', true)
    expect(await manifestDeeplinkValid.run(aCtx(withManifest(xml)))).toEqual([])
  })
})

describe('every check is platform-scoped to android', () => {
  const checks = [
    manifestWellFormed,
    manifestTagTypo,
    manifestNamespaceUri,
    manifestMissingPrefix,
    manifestExportedMissing,
    manifestMultipleUsesSdk,
    manifestDuplicateComponent,
    manifestUniquePermission,
    manifestHardcodedDebuggable,
    manifestMockLocation,
    manifestExportedUnprotected,
    manifestQueryAllPackages,
    manifestDeeplinkValid,
  ]
  it('declares android in platforms and a stable id', () => {
    for (const c of checks) {
      expect(c.platforms).toEqual(['android'])
      expect(c.id.startsWith('android/manifest-')).toBe(true)
    }
  })
  it('does not produce findings when no manifest exists', async () => {
    const dir = makeProject({ 'android/app/build.gradle': '' })
    for (const c of checks) {
      if (c.appliesTo && !c.appliesTo(aCtx(dir)))
        continue
      expect(await c.run(aCtx(dir))).toEqual([])
    }
  })
})
