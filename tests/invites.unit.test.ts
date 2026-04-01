import { describe, expect, it } from 'vitest'
import { shouldNotifyExistingUserInvite } from '../src/utils/invites'

describe('shouldNotifyExistingUserInvite', () => {
  it.concurrent('returns true for RBAC invite roles', () => {
    expect(shouldNotifyExistingUserInvite('org_admin', true)).toBe(true)
    expect(shouldNotifyExistingUserInvite('org_super_admin', true)).toBe(true)
  })

  it.concurrent('returns true for legacy invite rows', () => {
    expect(shouldNotifyExistingUserInvite('invite_admin', false)).toBe(true)
    expect(shouldNotifyExistingUserInvite('invite_super_admin', false)).toBe(true)
  })

  it.concurrent('returns false for legacy direct membership roles', () => {
    expect(shouldNotifyExistingUserInvite('admin', false)).toBe(false)
    expect(shouldNotifyExistingUserInvite('super_admin', false)).toBe(false)
  })
})
