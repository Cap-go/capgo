// src/build/onboarding/android/gradle-parser.ts
//
// Minimal Gradle build file parser — we only need to extract every
// `applicationId "..."` value so we can suggest real Play Console package
// names during onboarding (the Capacitor `appId` is often overridden by the
// CapacitorUpdater plugin block and doesn't match the Android package).

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

/**
 * Extract every `applicationId` string literal in a Gradle file.
 *
 * Handles:
 *   - Groovy:  applicationId "com.example.app"
 *   - Kotlin:  applicationId = "com.example.app"
 *   - Single quotes, extra whitespace, indented defaultConfig / flavor blocks
 *
 * Ignores:
 *   - `applicationIdSuffix` (not a real package — it's a suffix fragment)
 */
export function extractApplicationIds(gradleContent: string): string[] {
  // `applicationId`, optional whitespace, optional `=`, then a quoted string.
  // `applicationIdSuffix` cannot match because the char after `applicationId`
  // must be whitespace, `=`, or a quote — `S` fails all three.
  const regex = /\bapplicationId\s*(?:=\s*)?(['"])([^'"]+)\1/g
  const out = new Set<string>()
  for (const match of gradleContent.matchAll(regex)) {
    const value = match[2].trim()
    if (value)
      out.add(value)
  }
  return [...out]
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  }
  catch {
    return null
  }
}

/**
 * Look at the usual Gradle locations under `{androidDir}/app/` and return every
 * distinct `applicationId` found. Empty list if nothing is configured locally
 * (e.g. the user hasn't run `npx cap add android` yet or we're pointed at the
 * wrong directory).
 */
export async function findAndroidApplicationIds(androidDir: string, workingDir?: string): Promise<string[]> {
  const baseDir = workingDir ?? process.cwd()
  const candidates = [
    join(baseDir, androidDir, 'app', 'build.gradle'),
    join(baseDir, androidDir, 'app', 'build.gradle.kts'),
  ]
  const out = new Set<string>()
  for (const path of candidates) {
    const content = await readIfExists(path)
    if (!content)
      continue
    for (const id of extractApplicationIds(content))
      out.add(id)
  }
  return [...out]
}
