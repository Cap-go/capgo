// CI guard: the RELEASE bundle must contain NONE of these dev-only markers.
// Run AFTER `bun run build` (which produces dist/index.js with
// globalThis.__CAPGO_DEV__ defined to `false`, so DCE strips all dev branches).
import { readFileSync } from 'node:fs'

const bundle = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')
const forbidden = ['__CAPGO_DEV__', 'CAPGO_SPOOF', 'src/__dev__/', '__CAPGO_MCP_ONBOARDING__', 'start_capgo_builder_onboarding', 'capgo_builder_onboarding_next_step']

let fail = 0
for (const m of forbidden) {
  const present = bundle.includes(m)
  console.log(present ? `❌ LEAK: ${m} present in dist/index.js` : `✅ absent: ${m}`)
  if (present)
    fail++
}
console.log(fail ? `\n${fail} marker(s) leaked into the release bundle` : '\nrelease bundle is clean of dev markers')
process.exit(fail ? 1 : 0)
