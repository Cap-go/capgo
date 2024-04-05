import type { Queue, Hyperdrive } from "@cloudflare/workers-types"

export type Bindings = {
  QUEUE: Queue;
  HYPERDRIVE: Hyperdrive;
}
