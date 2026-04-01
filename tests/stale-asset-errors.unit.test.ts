import { describe, expect, it } from 'vitest'

import { getErrorMessage, isStaleAssetErrorMessage, shouldSuppressPostHogExceptionEvent } from '../src/services/staleAssetErrors'

describe('stale asset error helpers', () => {
  it('matches the stale asset errors currently seen in PostHog', () => {
    expect(isStaleAssetErrorMessage('Failed to fetch dynamically imported module: https://console.capgo.app/assets/dashboard-rYp22gdI.js')).toBe(true)
    expect(isStaleAssetErrorMessage('error loading dynamically imported module: https://console.capgo.app/assets/naked-DvVF29Ec.js')).toBe(true)
    expect(isStaleAssetErrorMessage('Importing a module script failed.')).toBe(true)
    expect(isStaleAssetErrorMessage('Unable to preload CSS for /assets/main-C3MIONxo.css')).toBe(true)
    expect(isStaleAssetErrorMessage('\'text/html\' is not a valid JavaScript MIME type.')).toBe(true)
  })

  it('does not match unrelated runtime errors', () => {
    expect(isStaleAssetErrorMessage('Failed to fetch')).toBe(false)
    expect(isStaleAssetErrorMessage('ResizeObserver loop completed with undelivered notifications.')).toBe(false)
    expect(isStaleAssetErrorMessage('Cannot read properties of undefined (reading \'digest\')')).toBe(false)
  })

  it('extracts useful messages from arbitrary rejection values', () => {
    expect(getErrorMessage(new Error('Importing a module script failed.'))).toBe('Importing a module script failed.')
    expect(getErrorMessage({ message: 'Unable to preload CSS for /assets/main.css' })).toBe('Unable to preload CSS for /assets/main.css')
    expect(getErrorMessage({ notMessage: true })).toBeUndefined()
  })

  it('suppresses only stale asset exception events in PostHog', () => {
    expect(shouldSuppressPostHogExceptionEvent({
      event: '$exception',
      properties: {
        $exception_list: [{ value: 'Failed to fetch dynamically imported module: https://console.capgo.app/assets/dashboard-rYp22gdI.js' }],
      },
    })).toBe(true)

    expect(shouldSuppressPostHogExceptionEvent({
      event: '$exception',
      properties: {
        $exception_values: ['Unable to preload CSS for /assets/main-C3MIONxo.css'],
      },
    })).toBe(true)

    expect(shouldSuppressPostHogExceptionEvent({
      event: '$exception',
      properties: {
        $exception_list: [{ value: 'ResizeObserver loop completed with undelivered notifications.' }],
      },
    })).toBe(false)
  })
})
