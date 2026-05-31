#!/usr/bin/env node
import assert from 'node:assert/strict'
import { setInvocationSource } from '../src/analytics/track.ts'
import { resolveAppCreateSource } from '../src/app/add.ts'

console.log('🧪 Testing App Created source resolution...\n')

// explicit onboarding wins
assert.equal(resolveAppCreateSource('onboarding'), 'onboarding')

// no explicit source, CLI context => cli-direct
setInvocationSource('cli')
assert.equal(resolveAppCreateSource(undefined), 'cli-direct')

// no explicit source, MCP context => mcp
setInvocationSource('mcp')
assert.equal(resolveAppCreateSource(undefined), 'mcp')
setInvocationSource('cli')

console.log('✅ App Created source tests passed')
