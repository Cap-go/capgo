/**
 * Xcode version the builder ran the job with, from GET /jobs/:id `machine.xcode_version`
 * (its major is the iOS SDK). Null when the builder has not reported a usable version.
 */
export function getBuilderXcodeVersion(machine: Record<string, unknown> | null | undefined): string | null {
  const value = machine?.xcode_version
  return typeof value === 'string' && /^\d{1,3}(?:\.\d{1,4}){0,3}$/.test(value) ? value : null
}
