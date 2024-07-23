import { isSpoofed } from './supabase'

declare global {
  interface Window {
    bento$: any
    bento: any
  }
}

export function bentoLoader(cb?: () => void) {
  if (typeof (window.bento$) === 'undefined') {
    if (cb)
      cb()
    return
  }
  const d = document
  const t = 'script'
  const id = '918a8522e8fff769da1bab1b3bbcbd01'
  const BASE_URL = `https://app.bentonow.com/${id}.js`
  const g = d.createElement(t) as any
  const s = d.getElementsByTagName(t)[0] as any
  g.src = BASE_URL
  g.defer = true
  g.async = true
  s.parentNode.insertBefore(g, s)
  window.addEventListener('bento:ready', () => {
    console.log('bento:ready')
    if (typeof (window.bento$) != 'undefined') {
      window.bento$(() => {
        if (cb)
          cb()
      })
    }
  })
}

export function openMessenger() {
  console.log('openMessenger')
  if (isSpoofed())
    return
  bentoLoader(() => {
    console.log('openMessenger2')
    window.bento.openChat()
    window.bento.showChat()
  })
}

export function pushEvent(nameEvent: string): void {
  if (isSpoofed())
    return
  bentoLoader(() => {
    window.bento.track(nameEvent)
  })
}

export function setUser(uuid: string, data: {
  nickname?: string
  phone?: string
  email?: string
  avatar?: string
}): void {
  // console.log('setUser chatwood')
  if (isSpoofed())
    return
  bentoLoader(() => {
    window.$chatwoot.setUser(uuid, {
      name: data.nickname,
      email: data.email,
      avatar_url: data.avatar,
      phone_number: data.phone,
    })
    window.bento.identify(data.email)
    window.bento.updateFields({ name: data.nickname })
    window.bento.updateFields({ email: data.email })
    window.bento.updateFields({ avatar_url: data.avatar })
    window.bento.updateFields({ phone_number: data.phone })
  })
}

export function reset(): void {
  if (isSpoofed())
    return
  bentoLoader(() => {
    window.$chatwoot.reset()
  })
}
