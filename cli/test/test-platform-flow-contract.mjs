import { isStepView } from '../src/build/onboarding/flow/contract.ts'
let pass = 0, fail = 0
const ok = (c, m) => c ? (pass++, console.log('OK', m)) : (fail++, console.error('FAIL', m))
ok(isStepView({ kind: 'choice', prompt: 'pick', options: [{ value: 'a', label: 'A' }] }), 'valid choice view')
ok(isStepView({ kind: 'human_gate', prompt: 'enter', collect: [{ field: 'x', desc: 'X' }] }), 'valid human_gate view')
ok(!isStepView({ kind: 'nope', prompt: 'x' }), 'rejects unknown kind')
ok(!isStepView({ prompt: 'x' }), 'rejects missing kind')
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
