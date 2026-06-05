#!/usr/bin/env node
import assert from 'node:assert/strict'
import { checkAppExistsAndHasPermissionOrgErr } from '../src/api/app.ts'

const calls = []
const supabase = {
  rpc(name, args) {
    calls.push({ name, args })
    if (name === 'exist_app_v2') {
      return {
        single: async () => ({ data: true, error: null }),
      }
    }
    if (name === 'cli_check_permission') {
      return Promise.resolve({ data: true, error: null })
    }
    throw new Error(`Unexpected RPC call: ${name}`)
  },
}

await checkAppExistsAndHasPermissionOrgErr(
  supabase,
  'ck_plain_cli_key',
  'com.example.app',
  'app.read_bundles',
  true,
  true,
)

assert.deepEqual(calls.map(call => call.name), ['exist_app_v2', 'cli_check_permission'])
assert.deepEqual(calls[1].args, {
  apikey: 'ck_plain_cli_key',
  permission_key: 'app.read_bundles',
  org_id: null,
  app_id: 'com.example.app',
  channel_id: null,
})

console.log('app permission helper tests passed')
