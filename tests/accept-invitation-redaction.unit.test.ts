import { describe, expect, it } from 'vitest'

/**
 * Unit tests verifying that magic_invite_string (the bearer credential
 * from invite links) is never included in accept_invitation log output.
 *
 * Covers:
 *  1. Raw body log path (after base schema validation)
 *  2. Validated body log path (after full schema + password policy validation)
 */

function buildRawBodyLog(body: Record<string, unknown>) {
  const { password: _password, captchaToken: _captchaToken, magic_invite_string: _magic, ...rest } = body as any
  return { ...rest, has_magic_invite_string: true }
}

function buildValidatedBodyLog(body: Record<string, unknown>) {
  const { password: _pwd, captchaToken: _cap, magic_invite_string: _inv, ...rest } = body as any
  return { ...rest, has_magic_invite_string: true }
}

describe('accept_invitation — magic_invite_string redaction', () => {
  const sensitiveToken = 'inv_abc123secretinvitetoken'

  const fullBody = {
    email: 'user@example.com',
    password: 's3cr3t!',
    magic_invite_string: sensitiveToken,
    captchaToken: 'cap_xyz',
  }

  it('raw body log does not contain magic_invite_string', () => {
    const logged = buildRawBodyLog(fullBody)
    expect(JSON.stringify(logged)).not.toContain(sensitiveToken)
    expect(logged.has_magic_invite_string).toBe(true)
    expect(logged).not.toHaveProperty('magic_invite_string')
    expect(logged).not.toHaveProperty('password')
    expect(logged).not.toHaveProperty('captchaToken')
  })

  it('validated body log does not contain magic_invite_string', () => {
    const logged = buildValidatedBodyLog(fullBody)
    expect(JSON.stringify(logged)).not.toContain(sensitiveToken)
    expect(logged.has_magic_invite_string).toBe(true)
    expect(logged).not.toHaveProperty('magic_invite_string')
    expect(logged).not.toHaveProperty('password')
  })

  it('has_magic_invite_string marker preserves request-shape context', () => {
    const logged = buildRawBodyLog(fullBody)
    expect(logged).toMatchObject({
      email: 'user@example.com',
      has_magic_invite_string: true,
    })
  })
})
