import { isSpoofed } from './supabase'

declare global {
  interface Window {
    chatwootSDK: any
    $chatwoot: any
    chatwootSettings: {
      hideMessageBubble?: boolean
      position?: string // This can be left or right
      locale?: string // Language to be set
      useBrowserLanguage?: boolean // Set widget language from user's browser
      type?: 'standard' | 'expanded_bubble' // [standard, expanded_bubble]
      darkMode: 'auto' | 'light' // [light, auto]
    }
  }
}
export function chatLoader(cb?: () => void) {
  if (window.chatwootSettings) {
    if (cb)
      cb()
    return
  }

  window.chatwootSettings = {
    hideMessageBubble: true,
    useBrowserLanguage: true,
    type: 'standard',
    darkMode: 'auto',
  }
  const d = document
  const t = 'script'
  const BASE_URL = 'https://app.chatwoot.com'
  const g = d.createElement(t) as any
  const s = d.getElementsByTagName(t)[0] as any
  g.src = `${BASE_URL}/packs/js/sdk.js`
  g.defer = true
  g.async = true
  s.parentNode.insertBefore(g, s)
  g.onload = function () {
    window.chatwootSDK.run({
      websiteToken: 'GvGEEE6AcQ3E6jhfSbwSQaXa',
      baseUrl: BASE_URL,
    })
    if (cb)
      setTimeout(cb, 300)
  }
}

export function openMessenger() {
  if (isSpoofed())
    return
  chatLoader(() => {
    window.$chatwoot.toggle('open')
  })
}

export function pushEvent(nameEvent: string): void {
  if (isSpoofed())
    return
  chatLoader(() => {
    window.$chatwoot.setLabel(nameEvent)
  })
}

export function setUserId(uuid: string): void {
  if (isSpoofed())
    return
  chatLoader(() => {
    window.$chatwoot.setCustomAttributes({
      accountId: uuid,
    })
  })
}

export function setUser(data: {
  nickname?: string
  phone?: string
  email?: string
  avatar?: string
}): void {
  // console.log('setUser chatwood')
  if (isSpoofed())
    return
  chatLoader(() => {
    window.$chatwoot.setUser({
      name: data.nickname,
      email: data.email,
      avatar_url: data.avatar,
      phone_number: data.phone,
    })
  })
}

export function reset(): void {
  if (isSpoofed())
    return
  chatLoader(() => {
    window.$chatwoot.reset()
  })
}
