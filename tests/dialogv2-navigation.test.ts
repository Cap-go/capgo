import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('dialog v2 navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    setActivePinia(createPinia())
  })

  it.each([
    'https://checkout.stripe.com/pay/cs_test_123',
    'http://localhost:5173/settings',
    'http://[::1]:5173/settings',
    '/settings/organization/plans',
    'mailto:support@capgo.app',
    'tel:+16504202207',
  ])('allows safe dialog href %s', async (href) => {
    const { isSafeDialogHref } = await import('~/stores/dialogv2')

    expect(isSafeDialogHref(href)).toBe(true)
  })

  it.each([
    '',
    '//evil.test/path',
    'http://evil.test/path',
    'javascript:alert(document.domain)',
    ' data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
  ])('rejects unsafe dialog href %s', async (href) => {
    const { isSafeDialogHref } = await import('~/stores/dialogv2')

    expect(isSafeDialogHref(href)).toBe(false)
  })

  it('does not navigate unsafe dialog hrefs', async () => {
    const open = vi.fn()
    const assign = vi.fn()
    vi.stubGlobal('window', { open, location: { assign } })

    const { useDialogV2Store } = await import('~/stores/dialogv2')
    const store = useDialogV2Store()

    store.openDialog({ title: 'Unsafe link' })
    expect(store.showDialog).toBe(true)

    await store.closeDialog({
      text: 'Continue',
      href: 'javascript:alert(document.domain)',
      target: '_blank',
    })

    expect(store.showDialog).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })

  it('opens safe blank-target hrefs without sharing the opener', async () => {
    const open = vi.fn()
    const assign = vi.fn()
    vi.stubGlobal('window', { open, location: { assign } })

    const { useDialogV2Store } = await import('~/stores/dialogv2')
    const store = useDialogV2Store()

    await store.closeDialog({
      text: 'Continue',
      href: ' https://checkout.stripe.com/pay/cs_test_123 ',
      target: '_blank',
      rel: 'noreferrer',
    })

    expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/pay/cs_test_123', '_blank', 'noopener,noreferrer')
    expect(assign).not.toHaveBeenCalled()
  })
})
