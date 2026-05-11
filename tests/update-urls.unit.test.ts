import { describe, expect, it } from 'vitest'

import { isAllowedUpdateUrl, normalizeUpdateUrl } from '~/services/updateUrls'

describe('update URL validation', () => {
  it.concurrent('accepts HTTPS update URLs and normalizes schemeless hosts', () => {
    expect(normalizeUpdateUrl('https://updates.example.com/bundle.zip')).toBe('https://updates.example.com/bundle.zip')
    expect(normalizeUpdateUrl('updates.example.com/bundle.zip')).toBe('https://updates.example.com/bundle.zip')
    expect(isAllowedUpdateUrl('https://updates.example.com/bundle.zip')).toBe(true)
  })

  it.concurrent('allows local HTTP URLs for development', () => {
    expect(normalizeUpdateUrl('http://localhost:5173/bundle.zip')).toBe('http://localhost:5173/bundle.zip')
    expect(normalizeUpdateUrl('http://preview.localhost/bundle.zip')).toBe('http://preview.localhost/bundle.zip')
    expect(normalizeUpdateUrl('http://[::1]:5173/bundle.zip')).toBe('http://[::1]:5173/bundle.zip')
  })

  it.concurrent('rejects insecure or non-web update targets', () => {
    expect(isAllowedUpdateUrl('http://updates.example.com/bundle.zip')).toBe(false)
    expect(isAllowedUpdateUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedUpdateUrl('file:///tmp/bundle.zip')).toBe(false)
    expect(isAllowedUpdateUrl('ftp://updates.example.com/bundle.zip')).toBe(false)
  })

  it.concurrent('rejects ambiguous browser-normalized URLs', () => {
    expect(isAllowedUpdateUrl('//updates.example.com/bundle.zip')).toBe(false)
    expect(isAllowedUpdateUrl('https://user:pass@updates.example.com/bundle.zip')).toBe(false)
    expect(isAllowedUpdateUrl('https:\\\\updates.example.com\\bundle.zip')).toBe(false)
  })
})
