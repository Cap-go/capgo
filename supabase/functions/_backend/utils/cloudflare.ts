import type { Hyperdrive, Queue } from '@cloudflare/workers-types'

export interface Bindings {
  QUEUE: Queue
  HYPERDRIVE: Hyperdrive
}
