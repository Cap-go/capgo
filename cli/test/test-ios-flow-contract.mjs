import { iosFlow } from '../src/build/onboarding/flow/ios-flow.ts'
let pass = 0, fail = 0
const ok = (c, m) => c ? (pass++, console.log('OK', m)) : (fail++, console.error('FAIL', m))
ok(typeof iosFlow.resumeStep === 'function', 'iosFlow.resumeStep exists')
ok(typeof iosFlow.viewForStep === 'function', 'iosFlow.viewForStep exists')
ok(typeof iosFlow.applyInput === 'function', 'iosFlow.applyInput exists')
ok(typeof iosFlow.runEffect === 'function', 'iosFlow.runEffect exists')
ok(iosFlow.resumeStep(null) === 'welcome', 'resumeStep(null) delegates to welcome')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
