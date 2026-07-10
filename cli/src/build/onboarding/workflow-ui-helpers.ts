import type { PackageManager } from './workflow-generator.js'

export interface BuildScriptOption {
  label: string
  value: string
}

/**
 * `getPMAndCommand()` returns the literal string 'unknown' when no recognizable
 * lockfile is present. The workflow generator only knows the four real ones —
 * fall back to 'npm' for the generator template.
 */
export function normalizePackageManager(pm: string): PackageManager {
  if (pm === 'bun' || pm === 'npm' || pm === 'pnpm' || pm === 'yarn')
    return pm
  return 'npm'
}

/**
 * Build the picker options for `pick-build-script`. Shows ALL scripts from
 * package.json (the user picks; we don't auto-guess), with the project-type
 * recommendation surfaced at the top, plus escape hatches for custom commands
 * and "skip build entirely" (raw HTML Capacitor apps).
 */
export function buildScriptPickerOptions(scripts: Record<string, string>, recommended: string | null): BuildScriptOption[] {
  const options: BuildScriptOption[] = []
  const seen = new Set<string>()

  if (recommended && Object.hasOwn(scripts, recommended)) {
    options.push({ label: `${recommended}    (recommended — matches your project type)`, value: recommended })
    seen.add(recommended)
  }

  const others = Object.keys(scripts).filter(name => !seen.has(name)).sort((a, b) => a.localeCompare(b))
  for (const name of others)
    options.push({ label: name, value: name })

  options.push({ label: 'Type a custom command…', value: '__custom__' })
  options.push({ label: 'Skip build step (my app is raw HTML)', value: '__skip__' })

  return options
}
