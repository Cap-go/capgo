export type eventColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'grey'
  | 'black'

export interface CapacitorCrispPlugin {
  configure(data: { websiteID: string }): Promise<void>
  openMessenger(): Promise<void>
  setTokenID(data: { tokenID: string }): Promise<void>
  setUser(data: {
    nickname?: string
    phone?: string
    email?: string
    avatar?: string
  }): Promise<void>
  pushEvent(data: { name: string; color: eventColor }): Promise<void>
  setCompany(data: {
    name: string
    url?: string
    description?: string
    employment?: [title: string, role: string]
    geolocation?: [country: string, city: string]
  }): Promise<void>
  setInt(data: { key: string; value: number }): Promise<void>
  setString(data: { key: string; value: string }): Promise<void>
  sendMessage(data: { value: string }): Promise<void>
  setSegment(data: { segment: string }): Promise<void>
  reset(): Promise<void>
}

declare global {
  interface Window {
    $crisp: unknown[]
    CRISP_RUNTIME_CONFIG: {
      lock_maximized: boolean
      lock_full_view: boolean
      cross_origin_cookies: boolean
    }
    CRISP_WEBSITE_ID: string
    CRISP_TOKEN_ID: string
  }
}

export class CapacitorCrispWeb {
  ifrm = document.createElement('iframe')
  $crisp: unknown[] = []

  constructor() {
    document.body.appendChild(this.ifrm)
    this.ifrm.style.position = 'absolute'
    this.ifrm.style.bottom = '0'
    this.ifrm.style.zIndex = '-1'
    this.ifrm.style.width = '100%'
    this.ifrm.style.height = '100%'
    this.ifrm.style.maxWidth = '500px'
    this.ifrm.style.backgroundClip = 'padding-box'
    this.ifrm.style.backgroundColor = 'black'
    this.ifrm.style.padding
      = 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
    if (!this.ifrm.contentWindow || !this.ifrm.contentDocument) return
    this.ifrm.contentWindow.$crisp = []
    const s = this.ifrm.contentDocument.createElement('script')
    if (!s) return
    s.src = 'https://client.crisp.chat/l.js'
    s.type = 'text/javascript'
    s.async = true
    this.ifrm.contentDocument.getElementsByTagName('head')[0].appendChild(s)
    this.setAutoHide()
  }

  private setAutoHide() {
    if (!this.ifrm.contentWindow) return
    this.ifrm.contentWindow.$crisp.push(
      ['safe', true],
      ['do', 'chat:hide'],
      [
        'on',
        'chat:closed',
        () => {
          if (!this.ifrm.contentWindow) return
          this.ifrm.style.zIndex = '-1'
          this.ifrm.contentWindow.$crisp.push(['do', 'chat:hide'])
        },
      ],
      [
        'on',
        'message:received',
        () => {
          if (!this.ifrm.contentWindow) return
          this.ifrm.contentWindow.$crisp.push(['do', 'chat:show'])
          this.ifrm.contentWindow.$crisp.push(['do', 'chat:open'])
          setTimeout(() => {
            this.ifrm.style.zIndex = '10'
          }, 50)
        },
      ],
    )
  }

  async configure(data: { websiteID: string }): Promise<void> {
    if (this.ifrm.contentWindow)
      this.ifrm.contentWindow.CRISP_WEBSITE_ID = data.websiteID
  }

  async openMessenger(): Promise<void> {
    if (!this.ifrm.contentWindow) return

    this.ifrm.contentWindow.$crisp.push(['do', 'chat:show'])
    this.ifrm.contentWindow.$crisp.push(['do', 'chat:open'])
    setTimeout(() => {
      this.ifrm.style.zIndex = '10'
    }, 50)
  }

  async setTokenID(data: { tokenID: string }): Promise<void> {
    if (this.ifrm.contentWindow)
      this.ifrm.contentWindow.CRISP_TOKEN_ID = data.tokenID
    this.reset()
  }

  async setUser(data: {
    nickname?: string
    phone?: string
    email?: string
    avatar?: string
  }): Promise<void> {
    if (!this.ifrm.contentWindow) return
    if (data.nickname) {
      this.ifrm.contentWindow.$crisp.push([
        'set',
        'user:nickname',
        [data.nickname],
      ])
    }
    if (data.email)
      this.ifrm.contentWindow.$crisp.push(['set', 'user:email', [data.email]])

    if (data.phone)
      this.ifrm.contentWindow.$crisp.push(['set', 'user:phone', [data.phone]])

    if (data.avatar)
      this.ifrm.contentWindow.$crisp.push(['set', 'user:avatar', [data.avatar]])
  }

  async pushEvent(data: { name: string; color: eventColor }): Promise<void> {
    if (!this.ifrm.contentWindow) return
    this.ifrm.contentWindow.$crisp.push([
      'set',
      'session:event',
      [[[data.name, null, data.color]]],
    ])
  }

  async setCompany(data: {
    name: string
    url?: string
    description?: string
    employment?: [title: string, role: string]
    geolocation?: [country: string, city: string]
  }): Promise<void> {
    if (!this.ifrm.contentWindow) return
    const meta: any = {}
    if (data.url)
      meta.url = data.url

    if (data.description)
      meta.description = data.description

    if (data.employment)
      meta.employment = data.employment

    if (data.geolocation)
      meta.geolocation = data.geolocation

    this.ifrm.contentWindow.$crisp.push([
      'set',
      'user:company',
      [data.name, meta],
    ])
  }

  async setInt(data: { key: string; value: number }): Promise<void> {
    if (!this.ifrm.contentWindow) return
    this.ifrm.contentWindow.$crisp.push([
      'set',
      'session:data',
      [[[data.key, data.value]]],
    ])
  }

  async setString(data: { key: string; value: string }): Promise<void> {
    if (!this.ifrm.contentWindow) return
    this.ifrm.contentWindow.$crisp.push([
      'set',
      'session:data',
      [[[data.key, data.value]]],
    ])
  }

  async sendMessage(data: { value: string }): Promise<void> {
    if (!this.ifrm.contentWindow) return
    this.ifrm.contentWindow.$crisp.push([
      'do',
      'message:send',
      ['text', data.value],
    ])
  }

  async setSegment(data: { segment: string }): Promise<void> {
    if (!this.ifrm.contentWindow) return
    this.ifrm.contentWindow.$crisp.push([
      'set',
      'session:segments',
      [[data.segment]],
    ])
  }

  async reset(): Promise<void> {
    if (!this.ifrm.contentWindow) return
    this.ifrm.contentWindow.$crisp.push(['do', 'session:reset'])
    this.setAutoHide()
  }
}
