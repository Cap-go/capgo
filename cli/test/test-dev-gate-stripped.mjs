// CI guard for the release bundle (run AFTER `bun run build`).
//
// History: the MCP Builder onboarding shipped behind `globalThis.__CAPGO_MCP_ONBOARDING__`,
// defined to `false` in PR 1 (DCE stripped the tools from dist) and flipped to `true`
// in PR 2 now that the full onboarding journey ships through the shared engine.
// The dev markers (`__CAPGO_DEV__`, spoof seams, `src/__dev__/`) stay forbidden forever —
// they are defined to `false` at build time and must never leak into a release.
// The `__CAPGO_MCP_ONBOARDING__` identifier itself must also be absent: the build-time
// define replaces it with a literal, so its presence would mean the define broke.
//
// Two checks:
//   1. NONE of the forbidden dev markers appear in dist/index.js.
//   2. ALL three onboarding tool names ARE present (the PR 2 flip shipped them).
import { readFileSync } from 'node:fs'

const bundle = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8')

const forbidden = ['__CAPGO_DEV__', 'CAPGO_SPOOF', 'src/__dev__/', '__CAPGO_MCP_ONBOARDING__', '__CAPGO_MCP_LIVE_UPDATE__']
const requiredTools = ['start_capgo_builder_onboarding', 'capgo_builder_onboarding_next_step', 'capgo_builder_onboarding_explain', 'start_capgo_live_update_onboarding', 'capgo_live_update_onboarding_next_step', 'capgo_live_update_onboarding_explain']

let fail = 0
for (const m of forbidden) {
  const present = bundle.includes(m)
  console.log(present ? `❌ LEAK: ${m} present in dist/index.js` : `✅ absent: ${m}`)
  if (present)
    fail++
}
for (const tool of requiredTools) {
  const present = bundle.includes(tool)
  console.log(present ? `✅ shipped: ${tool}` : `❌ MISSING: ${tool} not in dist/index.js (onboarding flip regressed)`)
  if (!present)
    fail++
}
console.log(fail ? `\n${fail} release-bundle check(s) failed` : '\nrelease bundle is clean: no dev markers, onboarding tools shipped')
process.exit(fail ? 1 : 0)
