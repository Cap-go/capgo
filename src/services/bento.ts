import { isSpoofed } from './supabase'

declare global {
  interface Window {
    $bentoChat: any
    bentoChatSDK: any
    bento$: any
    bento: any
  }
}

export function bentoLoader(cb?: () => void) {
  if (localStorage.getItem('bento:loading') === 'true') {
    window.addEventListener('bento:ready', () => {
      if (cb)
        cb()
    })
    return
  }
  else if (window.bento) {
    if (cb)
      cb()
    return
  }
  localStorage.setItem('bento:loading', 'true')
  console.log('Load bento')
  const d = document
  const t = 'script'
  const BASE_URL = 'https://app.bentonow.com/918a8522e8fff769da1bab1b3bbcbd01.js'
  const g = d.createElement(t) as HTMLScriptElement
  const s = d.getElementsByTagName(t)[0] as any
  g.src = `${BASE_URL}`
  g.defer = true
  g.async = true
  s.parentNode.insertBefore(g, s)
  window.addEventListener('bento:ready', () => {
    if (typeof (window.bento$) != 'undefined') {
      window.bento$(() => {
        window.bento.view()
        if (cb)
          setTimeout(cb, 300)
      })
      const BASE_URL = 'https://chat.bentonow.com'
      const g = d.createElement(t) as HTMLScriptElement
      const s = d.getElementsByTagName(t)[0] as any
      g.src = `${BASE_URL}/packs/js/sdk.js`
      g.defer = true
      g.async = true
      s.parentNode.insertBefore(g, s)
      g.onload = function () {
        window.bentoChatSDK.run({
          websiteToken: 'LYc2vrY6SsvSZxpqM7TZXADh',
          baseUrl: BASE_URL,
        })
        console.log('bentoChatSDK initialized')
        // window.bento.hideChat()
        localStorage.setItem('bento:loading', 'false')
        if (cb)
          setTimeout(cb, 300)
        const checkAndHideBubble = () => {
          const bubbleHolder = document.querySelector('.woot--bubble-holder') as HTMLElement
          if (bubbleHolder) {
            bubbleHolder.style.setProperty('display', 'none')
          }
          else {
            setTimeout(checkAndHideBubble, 100) // Check again after 100ms
          }
        }
        checkAndHideBubble()
        // watch for elem with class woot-elements--right woot-widget-bubble woot--close having woot--hide if found apply checkAndHideBubble
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
              const target = mutation.target as Element
              if (target.classList.contains('woot-elements--right')
                && target.classList.contains('woot-widget-bubble')
                && target.classList.contains('woot--close')
                && target.classList.contains('woot--hide')) {
                checkAndHideBubble()
              }
            }
          })
        })
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class'],
        })
      }
    }
  })
}

export function chatLoader(cb?: () => void) {
  if (window.bentoChatSDK) {
    if (cb)
      cb()
    return
  }
  bentoLoader(cb)
}

export function openMessenger() {
  if (isSpoofed())
    return
  chatLoader(() => {
    //  edit css woot--bubble-holder display (display: none !important;) attribute to remove it
    const bubbleHolder = document.querySelector('.woot--bubble-holder') as HTMLElement
    if (bubbleHolder) {
      bubbleHolder.style.setProperty('display', 'block')
    }
    window.bento.openChat()
  })
}

export function pushEvent(nameEvent: string): void {
  if (isSpoofed())
    return
  chatLoader(() => {
    window.bento.track(nameEvent)
  })
}

export function setUser(uuid: string, data: {
  nickname?: string
  phone?: string
  email?: string
  avatar?: string
}): void {
  if (isSpoofed())
    return
  chatLoader(() => {
    window.bento.identify(data.email)
    window.bento.updateFields({ name: data.nickname, avatar_url: data.avatar })
  })
}

export function reset(): void {
  if (isSpoofed())
    return
  chatLoader(() => {
    window.$bentoChat.reset()
  })
}
