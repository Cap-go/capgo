#!/usr/bin/env bun
/** Print every node of the Cloudflare Containers cluster with live health. */
import { admin, fail, loadState } from './lib.ts'

const state = loadState() ?? fail('no .cluster-state.json, run init_primary.ts first')
const res = await admin<{ cluster: string, nodes: unknown[] }>(state, 'GET', '/nodes')
console.log(JSON.stringify(res, null, 2))
for (const [name, n] of Object.entries(state.nodes))
  console.log(`${name}: hyperdrive=${n.hyperdriveId ?? '(pending)'} tunnel=${n.tunnelId} location=${n.locationHint}`)
