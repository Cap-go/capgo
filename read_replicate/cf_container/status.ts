#!/usr/bin/env bun
/** Print every node of the Cloudflare Containers cluster with live health. */
import { admin, clean, detail, fail, loadState, SOURCE_SLOT_NAME, sourceSql } from './lib.ts'

const state = loadState() ?? fail('no .cluster-state.json, run init_primary.ts first')
const res = await admin<{ cluster: string, nodes: unknown[] }>(state, 'GET', '/nodes')
console.log(clean(JSON.stringify(res, null, 2)))
for (const [name, n] of Object.entries(state.nodes))
  console.log(clean(`${name}: hyperdrive=${n.hyperdriveId ?? '(pending)'} tunnel=${n.tunnelId} location=${n.locationHint}`))

// The logical slot pins WAL on Supabase while the primary is down or behind.
const slot = await sourceSql(`SELECT coalesce(active::text, '') || ' ' || coalesce(pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)), '') FROM pg_replication_slots WHERE slot_name = '${SOURCE_SLOT_NAME}'`)
detail(slot ? `source slot ${SOURCE_SLOT_NAME}: active=${slot.split(' ')[0]} retained_wal=${slot.split(' ').slice(1).join(' ')}` : `source slot ${SOURCE_SLOT_NAME}: missing`)
