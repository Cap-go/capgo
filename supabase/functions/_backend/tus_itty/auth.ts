// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { Buffer } from 'node:buffer'

export interface Auth {
  generatePass: (username: string) => Promise<string>

  validateCredentials: (username: string, password: string) => Promise<boolean>
}

interface UnixTime {
  (): number
}

export async function createAuthWithClock(secret: string, maxAgeSeconds: number, clock: UnixTime): Promise<Auth> {
  const keyBytes = Buffer.from(secret, 'base64')
  const macKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  return {
    async generatePass(username: string): Promise<string> {
      const now = clock().toString()
      const data = Buffer.from(`${username}:${now}`, 'utf-8')
      const sig = (await crypto.subtle.sign('HMAC', macKey, data)).slice(0, 10)
      return `${now}:${Buffer.from(sig).toString('hex')}`
    },

    async validateCredentials(username: string, password: string): Promise<boolean> {
      const truncatedSignatureLength = 10

      const [ts, sig] = password.split(':')
      const actual = Buffer.from(sig, 'hex')
      if (actual.length !== truncatedSignatureLength) {
        // timingSafeEqual throws if the buffers are not the same length
        return false
      }
      const data = Buffer.from(`${username}:${ts}`, 'utf-8')
      const expected = (await crypto.subtle.sign('HMAC', macKey, data)).slice(0, truncatedSignatureLength)
      if (!crypto.subtle.timingSafeEqual(actual, expected)) {
        return false
      }

      const now = clock()
      const tsSecs = Number.parseInt(ts)
      return tsSecs + maxAgeSeconds >= now
    },
  }
}

export async function createAuth(secret: string, maxAgeSeconds: number): Promise<Auth> {
  return await createAuthWithClock(secret, maxAgeSeconds, () => Math.floor(new Date().getTime() / 1000))
}
