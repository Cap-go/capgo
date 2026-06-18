// test/prescan/gradle-resolve.test.ts
import { describe, expect, it } from 'bun:test'
import {
  gradleApplicationId,
  resolveSdk,
  stripGradleComments,
  variablesGradle,
} from '../../src/build/prescan/gradle'
import { makeProject } from './helpers'

describe('stripGradleComments', () => {
  it('removes line and block comments', () => {
    const src = `android {
  // applicationId "com.commented.out"
  defaultConfig {
    applicationId "com.real.app" /* inline block */
  }
  /*
   minSdkVersion 99
  */
}`
    const stripped = stripGradleComments(src)
    expect(stripped).toContain('com.real.app')
    expect(stripped).not.toContain('com.commented.out')
    expect(stripped).not.toContain('minSdkVersion 99')
    expect(stripped).not.toContain('inline block')
  })

  it('preserves // sequences inside string literals are not required, but does not crash on URLs', () => {
    const src = 'def url = "https://example.com/path"'
    // Conservative comment stripping may trim the URL tail; we only require it
    // does not throw and keeps the assignment keyword.
    expect(() => stripGradleComments(src)).not.toThrow()
    expect(stripGradleComments(src)).toContain('def url =')
  })
})

describe('gradleApplicationId (hardened: comment-strip first)', () => {
  it('does NOT match a commented-out applicationId', () => {
    const dir = makeProject({
      'android/app/build.gradle': `android {
  defaultConfig {
    // applicationId "com.ghost.commented"
  }
}`,
    })
    expect(gradleApplicationId(dir)).toBeNull()
  })

  it('matches a live applicationId even when a commented one precedes it', () => {
    const dir = makeProject({
      'android/app/build.gradle': `android {
  defaultConfig {
    // applicationId "com.ghost.commented"
    applicationId "com.real.app"
  }
}`,
    })
    expect(gradleApplicationId(dir)).toBe('com.real.app')
  })
})

describe('variablesGradle', () => {
  it('parses ext { name = <int> } into a number map', () => {
    const dir = makeProject({
      'android/variables.gradle': `ext {
  minSdkVersion = 23
  compileSdkVersion = 34
  targetSdkVersion = 35
  androidxActivityVersion = '1.8.0'
}`,
    })
    const vars = variablesGradle(dir)
    expect(vars.minSdkVersion).toBe(23)
    expect(vars.compileSdkVersion).toBe(34)
    expect(vars.targetSdkVersion).toBe(35)
    // non-integer values are ignored
    expect(vars.androidxActivityVersion).toBeUndefined()
  })

  it('ignores commented-out variables', () => {
    const dir = makeProject({
      'android/variables.gradle': `ext {
  // minSdkVersion = 99
  targetSdkVersion = 35
}`,
    })
    const vars = variablesGradle(dir)
    expect(vars.minSdkVersion).toBeUndefined()
    expect(vars.targetSdkVersion).toBe(35)
  })

  it('returns empty map when file absent', () => {
    const dir = makeProject({ 'package.json': '{}' })
    expect(variablesGradle(dir)).toEqual({})
  })
})

describe('resolveSdk', () => {
  it('prefers a literal in app/build.gradle over variables.gradle', () => {
    const dir = makeProject({
      'android/app/build.gradle': `android {
  defaultConfig {
    targetSdkVersion 33
  }
}`,
      'android/variables.gradle': 'ext { targetSdkVersion = 35 }',
    })
    expect(resolveSdk(dir, 'targetSdk')).toBe(33)
  })

  it('falls back to variables.gradle when app/build.gradle only references rootProject.ext', () => {
    const dir = makeProject({
      'android/app/build.gradle': `android {
  defaultConfig {
    targetSdkVersion rootProject.ext.targetSdkVersion
  }
}`,
      'android/variables.gradle': 'ext { targetSdkVersion = 35 }',
    })
    expect(resolveSdk(dir, 'targetSdk')).toBe(35)
  })

  it('falls back to the manifest uses-sdk when neither gradle source resolves', () => {
    const dir = makeProject({
      'android/app/build.gradle': 'android { }',
      'android/app/src/main/AndroidManifest.xml': `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-sdk android:minSdkVersion="23" android:targetSdkVersion="34" />
</manifest>`,
    })
    expect(resolveSdk(dir, 'minSdk')).toBe(23)
    expect(resolveSdk(dir, 'targetSdk')).toBe(34)
  })

  it('ignores a commented-out literal in app/build.gradle', () => {
    const dir = makeProject({
      'android/app/build.gradle': `android {
  defaultConfig {
    // targetSdkVersion 22
  }
}`,
      'android/variables.gradle': 'ext { targetSdkVersion = 35 }',
    })
    expect(resolveSdk(dir, 'targetSdk')).toBe(35)
  })

  it('returns null when the dimension is unresolved', () => {
    const dir = makeProject({ 'android/app/build.gradle': 'android { }' })
    expect(resolveSdk(dir, 'compileSdk')).toBeNull()
  })

  it('resolves compileSdk from a compileSdkVersion literal', () => {
    const dir = makeProject({
      'android/app/build.gradle': 'android { compileSdkVersion 34 }',
    })
    expect(resolveSdk(dir, 'compileSdk')).toBe(34)
  })
})
