import { describe, expect, it } from 'vitest'
import { REPLICA_TYPES, replicaConfigPattern } from '../read_replicate/schema_catalog.ts'

describe('read replica schema catalog', () => {
  it('does not export the removed legacy RBAC enum', () => {
    expect(REPLICA_TYPES).not.toContain('user_min_right')
    expect(replicaConfigPattern(REPLICA_TYPES)).not.toContain('user_min_right')
  })
})
