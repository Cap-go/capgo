import { afterEach, describe, expect, it, vi } from 'vitest'

import { openExternalLink } from '~/services/externalLinks'

describe('external link navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens external links without sharing the opener', () => {
    const popup = { opener: { location: 'https://app.capgo.test' } }
    const open = vi.fn(() => popup)
    vi.stubGlobal('window', { open })

    openExternalLink('https://preview.capgo.test/')

    expect(open).toHaveBeenCalledWith('https://preview.capgo.test/', '_blank', 'noopener,noreferrer')
    expect(popup.opener).toBeNull()
  })

  it('does not open an empty link', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })

    openExternalLink('')

    expect(open).not.toHaveBeenCalled()
  })
})
