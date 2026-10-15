import type { Context } from 'hono'
import { base64url, compactDecrypt, CompactEncrypt } from 'jose'
import { closeClient, getPgClient } from './pg.ts'

export function authRandom() {
  return base64url.encode(crypto.getRandomValues(new Uint8Array(32)))
}

export async function authHash(value: string) {
  return base64url.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

// Stored credentials are short-lived and encrypted with server-only key material.
async function encryptionKey(secret: string, domain: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${domain}:${secret}`)))
}

export async function sealAuthCredential(value: unknown, secret: string, domain: string) {
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(value)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(await encryptionKey(secret, domain))
}

export async function openAuthCredential<T>(value: string, secret: string, domain: string): Promise<T> {
  const { plaintext } = await compactDecrypt(value, await encryptionKey(secret, domain), { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] })
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

export async function authQuery<T extends Record<string, any>>(c: Context, query: string, params: unknown[]) {
  const client = await getPgClient(c)
  try {
    return (await client.query<T>(query, params)).rows
  }
  finally {
    await closeClient(c, client)
  }
}

export function sanitizeAuthName(value: unknown) {
  return typeof value === 'string' && !/[<>]/.test(value)
    ? value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 100)
    : ''
}

export async function authNonceHash(value: string) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
export interface SocialAuthAttempt extends Record<string, unknown> {
  state_hash: string
  nonce: string
  redirect_uri: string
  code_challenge: string
  client_state: string
  expected_user_id: string | null
  expected_subject: string | null
  credential: string | null
}
