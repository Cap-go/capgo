import { describe, expect, it } from 'vitest'
import { shouldAttemptExistingUserInviteNotification, shouldNotifyExistingUserInvite } from '../src/utils/invites'

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

describe('shouldAttemptExistingUserInviteNotification', () => {
  it.concurrent('returns true for new invites and pending invite resends', () => {
    expect(shouldAttemptExistingUserInviteNotification('OK', 'invite_admin', false)).toBe(true)
    expect(shouldAttemptExistingUserInviteNotification('OK', 'org_admin', true)).toBe(true)
    expect(shouldAttemptExistingUserInviteNotification('ALREADY_INVITED', 'invite_admin', false, true)).toBe(true)
    expect(shouldAttemptExistingUserInviteNotification('ALREADY_INVITED', 'org_admin', true, true)).toBe(true)
  })

  it.concurrent('returns false for outputs that should not send email', () => {
    expect(shouldAttemptExistingUserInviteNotification('NO_EMAIL', 'invite_admin', false)).toBe(false)
    expect(shouldAttemptExistingUserInviteNotification('CAN_NOT_INVITE_OWNER', 'org_admin', true)).toBe(false)
    expect(shouldAttemptExistingUserInviteNotification('ALREADY_INVITED', 'invite_admin', false)).toBe(false)
    expect(shouldAttemptExistingUserInviteNotification('ALREADY_INVITED', 'org_admin', true)).toBe(false)
  })

  it.concurrent('returns false for legacy direct membership roles', () => {
    expect(shouldAttemptExistingUserInviteNotification('OK', 'admin', false)).toBe(false)
    expect(shouldAttemptExistingUserInviteNotification('ALREADY_INVITED', 'super_admin', false)).toBe(false)
  })
})
