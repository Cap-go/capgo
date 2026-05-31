/**
 * Thin wrapper that turns the pure `generateWorkflow` output into actual files
 * on disk. Kept separate from `workflow-generator.ts` so the generator stays
 * trivially unit-testable without mocking fs.
 *
 * The wizard's Ink layer owns all prompts (overwrite confirmation, etc.); this
 * module only handles "does it exist?" and "write it".
 */

import type { GeneratedWorkflow, WorkflowGeneratorOpts } from './workflow-generator.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cwd } from 'node:process'
import { generateWorkflow, WORKFLOW_PATH } from './workflow-generator.js'

// Re-export so callers don't need a second import from workflow-generator.
export { WORKFLOW_PATH }

export interface WorkflowWriteOptions {
  /** When true, overwrite an existing file. Default: false. */
  overwrite?: boolean
  /** Optional base dir override. Defaults to cwd(). */
  baseDir?: string
}

export type WorkflowWriteResult
  = | { kind: 'written', absolutePath: string, content: string }
    | { kind: 'exists', absolutePath: string, existingContent: string, newContent: string }

/**
 * Generate the workflow YAML and write it to `.github/workflows/capgo-build.yml`.
 * Creates the `.github/workflows/` directory if it doesn't exist.
 *
 * If the file already exists and `overwrite` is false, returns `kind: 'exists'`
 * with both the existing and proposed content so the caller can render a diff
 * and ask for explicit confirmation before clobbering.
 */
export function writeWorkflowFile(
  opts: WorkflowGeneratorOpts,
  writeOptions: WorkflowWriteOptions = {},
): WorkflowWriteResult {
  const base = writeOptions.baseDir ?? cwd()
  const absolutePath = resolve(base, WORKFLOW_PATH)
  const generated: GeneratedWorkflow = generateWorkflow(opts)

  if (existsSync(absolutePath) && !writeOptions.overwrite) {
    const existingContent = readFileSync(absolutePath, 'utf8')
    return {
      kind: 'exists',
      absolutePath,
      existingContent,
      newContent: generated.content,
    }
  }

  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, generated.content)

  return { kind: 'written', absolutePath, content: generated.content }
}
