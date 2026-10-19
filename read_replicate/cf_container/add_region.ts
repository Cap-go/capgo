#!/usr/bin/env bun
/**
 * Attach (or remove) a regional read replica to the Cloudflare Containers cluster.
 *
 *   bun read_replicate/cf_container/add_region.ts <name> --location <hint> [--env preprod|prod] [--no-wait]
 *   bun read_replicate/cf_container/add_region.ts <name> --remove [--env preprod|prod]
 *
 * --env defaults to preprod.
 *
 * <name>: lowercase id, e.g. us-east, asia, sa.
 * <hint>: Durable Object location hint (wnam enam sam weur eeur apac oc afr me);
 *         the container starts in a Cloudflare location close to it.
 *
 * Attaching creates the tunnel + VPC service, registers the node with the
 * control Worker (which starts it immediately and keeps it alive via cron),
 * waits for it to restore the latest base backup from R2 and catch up on the
 * archived WAL, then creates its Hyperdrive config.
 */
import type { LocationHint } from './lib.ts'
import {
  admin,
  CLUSTER_ENV,
  deprovisionNodeNetwork,
  fail,
  LOCATION_HINTS,
  loadState,
  log,
  parseArgs,
  provisionHyperdrive,
  provisionTunnel,
  waitForNode,
} from './lib.ts'

// Replicas catch up when replay lag is below this (archive_timeout is 30s).
const MAX_READY_LAG_S = 120

const { flags, positional } = parseArgs(process.argv.slice(2))
const name = positional[0] ?? fail('usage: add_region.ts <name> --location <hint> | --remove')
if (!/^[a-z][a-z0-9-]{1,30}$/.test(name) || name === 'primary')
  fail('name must match ^[a-z][a-z0-9-]{1,30}$ and not be "primary"')

const state = loadState() ?? fail('no .cluster-state.json, run init_primary.ts first')

if (flags.remove) {
  log(`removing ${name}`)
  await admin(state, 'DELETE', `/nodes/${name}`)
  await deprovisionNodeNetwork(state, name)
  log(`${name} removed (remember to drop its Hyperdrive binding from the plugin worker first)`)
  process.exit(0)
}

const location = String(flags.location ?? '') as LocationHint
if (!LOCATION_HINTS.includes(location))
  fail(`--location must be one of ${LOCATION_HINTS.join(', ')}`)

const tunnel = await provisionTunnel(state, name, location)

log(`starting replica ${name} in ${location}`)
await admin(state, 'PUT', `/nodes/${name}`, { role: 'replica', locationHint: location, tunnelToken: tunnel.tunnelToken })

if (flags['no-wait']) {
  log(`not waiting; check progress with: bun run pgcf:status --env ${CLUSTER_ENV}`)
  process.exit(0)
}

log('waiting for restore from R2 + WAL catch-up')
await waitForNode(state, name, (h) => {
  const pg = h.node?.postgres
  return h.node?.phase === 'running' && pg?.in_recovery === true
    && pg.replay_lag_s != null && pg.replay_lag_s < MAX_READY_LAG_S
})

const hyperdriveId = await provisionHyperdrive(state, name)
log(`${name} ready`)
console.log(`    hyperdrive: ${hyperdriveId}  (bind it in the plugin worker for ${location})`)
