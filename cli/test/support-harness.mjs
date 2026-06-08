// cli/test/support-harness.mjs
// Shared tiny test harness for the support-feature test suites.
export function t(name, fn) {
  try { fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}

export async function ta(name, fn) {
  try { await fn(); process.stdout.write(`✓ ${name}\n`) }
  catch (e) { process.stderr.write(`✗ ${name}\n`); throw e }
}
