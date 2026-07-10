// test/prescan/manifest.test.ts
import { describe, expect, it } from 'bun:test'
import {
  applicationBlock,
  editDistance,
  hasNamespaceXmlns,
  MANIFEST_VALID_TAGS,
  readAndroidManifest,
  scanElements,
  SCHEME_RE,
  stripXmlComments,
} from '../../src/build/prescan/manifest'
import { makeProject } from './helpers'

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.demo.app">
  <uses-permission android:name="android.permission.INTERNET" />
  <application android:name=".MainApplication" android:label="Demo" android:exported="false">
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>`

describe('scanElements', () => {
  it('parses tag names and attribute maps', () => {
    const els = scanElements(MANIFEST)
    const tags = els.map(e => e.tag)
    expect(tags).toContain('manifest')
    expect(tags).toContain('uses-permission')
    expect(tags).toContain('application')
    expect(tags).toContain('activity')
    expect(tags).toContain('action')
    expect(tags).toContain('category')
  })

  it('captures attribute key/value pairs including namespaced keys', () => {
    const els = scanElements(MANIFEST)
    const activity = els.find(e => e.tag === 'activity')
    expect(activity).toBeDefined()
    expect(activity!.attrs['android:name']).toBe('.MainActivity')
    expect(activity!.attrs['android:exported']).toBe('true')
  })

  it('records package on manifest open tag', () => {
    const els = scanElements(MANIFEST)
    const manifest = els.find(e => e.tag === 'manifest')
    expect(manifest!.attrs.package).toBe('com.demo.app')
  })

  it('handles self-closing and offset markers', () => {
    const els = scanElements(MANIFEST)
    const perm = els.find(e => e.tag === 'uses-permission')
    expect(perm!.attrs['android:name']).toBe('android.permission.INTERNET')
    expect(perm!.end).toBeGreaterThan(perm!.start)
    expect(perm!.rawOpenTag).toContain('uses-permission')
  })

  it('ignores closing tags', () => {
    const els = scanElements('<application></application>')
    expect(els.map(e => e.tag)).toEqual(['application'])
  })

  it('parses single-quoted attribute values (does not drop the element)', () => {
    const els = scanElements(`<application android:label='Demo' android:exported="false"></application>`)
    const app = els.find(e => e.tag === 'application')
    expect(app).toBeDefined()
    expect(app!.attrs['android:label']).toBe('Demo')
    expect(app!.attrs['android:exported']).toBe('false')
  })

  it('parses mixed single/double-quoted attribute values', () => {
    const els = scanElements(`<activity android:name=".X" android:label='Mixed' />`)
    const act = els.find(e => e.tag === 'activity')
    expect(act).toBeDefined()
    expect(act!.attrs['android:name']).toBe('.X')
    expect(act!.attrs['android:label']).toBe('Mixed')
  })
})

describe('stripXmlComments', () => {
  it('removes single and multi-line comments', () => {
    const raw = '<a/><!-- <b/> --><c/>\n<!--\nmulti\n<d/>\n-->\n<e/>'
    const stripped = stripXmlComments(raw)
    expect(stripped).not.toContain('<b/>')
    expect(stripped).not.toContain('<d/>')
    expect(stripped).toContain('<a/>')
    expect(stripped).toContain('<c/>')
    expect(stripped).toContain('<e/>')
  })

  it('makes scanElements skip commented-out elements', () => {
    const raw = '<manifest><!-- <activity android:name=".Ghost"/> --><application/></manifest>'
    const els = scanElements(stripXmlComments(raw))
    expect(els.map(e => e.tag)).not.toContain('activity')
  })
})

describe('editDistance (bounded)', () => {
  it('returns 0 for identical strings', () => {
    expect(editDistance('activity', 'activity', 3)).toBe(0)
  })

  it('computes small distances', () => {
    expect(editDistance('activty', 'activity', 3)).toBe(1)
    expect(editDistance('aplication', 'application', 3)).toBe(1)
    expect(editDistance('servce', 'service', 3)).toBe(1)
  })

  it('caps at max + 1 for distant strings (no expensive full compute)', () => {
    // "completelyunrelated" vs "x" - distance far exceeds 3
    const d = editDistance('completelyunrelated', 'x', 3)
    expect(d).toBeGreaterThan(3)
  })

  it('short-circuits on length difference greater than max', () => {
    expect(editDistance('ab', 'abcdefgh', 3)).toBeGreaterThan(3)
  })
})

describe('hasNamespaceXmlns', () => {
  it('detects android + tools namespaces', () => {
    expect(hasNamespaceXmlns(MANIFEST).android).toBe(true)
    expect(hasNamespaceXmlns(MANIFEST).tools).toBe(false)
    const withTools = MANIFEST.replace('xmlns:android', 'xmlns:tools="http://schemas.android.com/tools" xmlns:android')
    expect(hasNamespaceXmlns(withTools).tools).toBe(true)
  })
})

describe('applicationBlock', () => {
  it('slices the application element body', () => {
    const block = applicationBlock(MANIFEST)
    expect(block).not.toBeNull()
    expect(block!.openTag).toContain('<application')
    expect(block!.body).toContain('<activity')
    expect(block!.start).toBeLessThan(block!.end)
  })

  it('returns null when there is no application element', () => {
    expect(applicationBlock('<manifest></manifest>')).toBeNull()
  })
})

describe('MANIFEST_VALID_TAGS', () => {
  it('includes the canonical Android Lint tags', () => {
    expect(MANIFEST_VALID_TAGS.has('manifest')).toBe(true)
    expect(MANIFEST_VALID_TAGS.has('application')).toBe(true)
    expect(MANIFEST_VALID_TAGS.has('uses-sdk')).toBe(true)
    expect(MANIFEST_VALID_TAGS.has('queries')).toBe(true)
    expect(MANIFEST_VALID_TAGS.has('not-a-real-tag')).toBe(false)
  })
})

describe('SCHEME_RE (shared with iOS plist grammar)', () => {
  it('accepts RFC-3986 schemes and rejects underscores', () => {
    expect(SCHEME_RE.test('https')).toBe(true)
    expect(SCHEME_RE.test('com.demo.app')).toBe(true)
    expect(SCHEME_RE.test('my_scheme')).toBe(false)
    expect(SCHEME_RE.test('1scheme')).toBe(false)
  })
})

describe('readAndroidManifest (memoized)', () => {
  it('reads the canonical manifest path', () => {
    const dir = makeProject({ 'android/app/src/main/AndroidManifest.xml': MANIFEST })
    const r = readAndroidManifest(dir)
    expect(r).not.toBeNull()
    expect(r!.raw).toContain('<application')
    expect(r!.path).toContain('AndroidManifest.xml')
  })

  it('returns null when absent', () => {
    const dir = makeProject({ 'package.json': '{}' })
    expect(readAndroidManifest(dir)).toBeNull()
  })

  it('memoizes per projectDir (same object on repeat reads)', () => {
    const dir = makeProject({ 'android/app/src/main/AndroidManifest.xml': MANIFEST })
    const a = readAndroidManifest(dir)
    const b = readAndroidManifest(dir)
    expect(a).toBe(b)
  })
})
