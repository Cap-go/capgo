import type { OnboardingProgress, OnboardingStep } from './types.js'
// src/build/onboarding/progress.ts
import { readFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ensureSecureDirectory, writeFileAtomic } from '../../utils/safeWrites.js'

const CREDENTIALS_DIR = '.capgo-credentials'
const ONBOARDING_DIR = 'onboarding'

function getOnboardingDir(baseDir?: string): string {
  const base = baseDir || join(homedir(), CREDENTIALS_DIR)
  return join(base, ONBOARDING_DIR)
}

/** Sanitize appId to prevent path traversal (e.g. "../" or absolute paths) */
function sanitizeAppId(appId: string): string {
  // Strip path separators and traversal sequences, keep only safe chars
  const sanitized = appId.replace(/[/\\]/g, '_').replace(/\.\./g, '_')
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error(`Invalid appId for progress file: "${appId}"`)
  }
  return sanitized
}

function getProgressPath(appId: string, baseDir?: string): string {
  return join(getOnboardingDir(baseDir), `${sanitizeAppId(appId)}.json`)
}

/**
 * Load onboarding progress for an app. Returns null if no progress file exists.
 */
export async function loadProgress(
  appId: string,
  baseDir?: string,
): Promise<OnboardingProgress | null> {
  const filePath = getProgressPath(appId, baseDir)
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as OnboardingProgress
  }
  catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * Save onboarding progress. Creates the onboarding directory if needed.
 * File is written with mode 0o600, directory with 0o700.
 */
export async function saveProgress(
  appId: string,
  progress: OnboardingProgress,
  baseDir?: string,
): Promise<void> {
  const dir = getOnboardingDir(baseDir)
  await ensureSecureDirectory(dir, 0o700)
  const filePath = getProgressPath(appId, baseDir)
  await writeFileAtomic(filePath, JSON.stringify(progress, null, 2), { mode: 0o600 })
}

/**
 * Delete the progress file for an app (called on successful completion).
 */
export async function deleteProgress(
  appId: string,
  baseDir?: string,
): Promise<void> {
  const filePath = getProgressPath(appId, baseDir)
  try {
    await unlink(filePath)
  }
  catch {
    // File doesn't exist, that's fine
  }
}

/**
 * Determine the first incomplete step based on saved progress.
 * Returns the step to resume from.
 */
export function getResumeStep(progress: OnboardingProgress | null): OnboardingStep {
  if (!progress)
    return 'welcome'

  const { completedSteps } = progress

  if (!completedSteps.apiKeyVerified) {
    // Resume at the furthest partial input step
    if (progress.issuerId && progress.keyId && progress.p8Path)
      return 'verifying-key'
    if (progress.keyId && progress.p8Path)
      return 'input-issuer-id'
    if (progress.p8Path)
      return 'input-key-id'
    return 'api-key-instructions'
  }
  if (!completedSteps.certificateCreated)
    return 'creating-certificate'
  if (!completedSteps.profileCreated)
    return 'creating-profile'

  return 'saving-credentials'
}
