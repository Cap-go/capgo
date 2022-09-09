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
    CRISP_READY_TRIGGER: () => void
    pushToCrisp: (data: string) => void
    CRISP_WEBSITE_ID: string
    CRISP_TOKEN_ID: string
  }
}

export class CapacitorCrispWeb {
  ifrm: HTMLIFrameElement = document.createElement('iframe')
  isReady = false
  tmpArr: unknown[] = []

  constructor() {
    this.createStyle()
    document.body.appendChild(this.ifrm)
    this.createIframe()
    if (this.ifrm.contentDocument) {
      const s = this.createScript(this.ifrm.contentDocument, 'iframe')
      this.ifrm.contentDocument.getElementsByTagName('head')[0].appendChild(s)
    }
    this.setAutoHide()
  }

  private createScript(source: Document, id: string) {
    const s = source.createElement('script')
    s.src = 'https://client.crisp.chat/l.js'
    s.type = 'text/javascript'
    s.id = `crisp-script-${id}`
    s.async = true
    return s
  }

  private createStyle() {
    this.ifrm.style.position = 'absolute'
    this.ifrm.style.bottom = '0'
    this.ifrm.style.right = '0'
    this.ifrm.style.display = 'none'
    this.ifrm.style.width = '100%'
    this.ifrm.style.height = '100%'
    this.ifrm.style.maxWidth = '500px'
    this.ifrm.style.backgroundClip = 'padding-box'
    this.ifrm.style.backgroundColor = 'black'
    this.ifrm.title = 'Crisp Chat Iframe'
    this.ifrm.id = 'crisp-chat-iframe'

    this.ifrm.style.padding
      = 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  }

  private createIframe() {
    if (!this.ifrm.contentWindow || !this.ifrm.contentDocument) {
      console.error(
        'iframe not created, missing contentWindow or contentDocument',
      )
      return
    }
    if (!this.ifrm.contentWindow.$crisp)
      this.ifrm.contentWindow.$crisp = []

    this.ifrm.contentWindow.CRISP_WEBSITE_ID = import.meta.env.crisp as string
    this.ifrm.contentWindow.CRISP_RUNTIME_CONFIG = {
      lock_maximized: true,
      lock_full_view: false,
      cross_origin_cookies: true,
    }
    this.ifrm.contentWindow.CRISP_READY_TRIGGER = () => {
      if (!this.ifrm.contentWindow)
        return
      // console.log('crisp iframe ready')
      this.isReady = true
      this.push([])
    }
    const script = this.ifrm.contentDocument.createElement('script')
    script.append(`
      window.pushToCrisp = function(data) {
        window.$crisp.push(JSON.parse(data));
      }
  `)
    this.ifrm.contentDocument.body.appendChild(script)

    const b = this.ifrm.contentDocument.createElement('button')
    // create close cross top right
    b.style.position = 'absolute'
    b.style.top = '0'
    b.style.right = '0'
    b.style.zIndex = '1000001'
    b.style.width = '50px'
    b.style.height = '50px'
    b.style.backgroundColor = 'transparent'
    b.style.cursor = 'pointer'
    b.style.border = 'none'
    b.style.fill = 'white'
    b.style.padding = '10px'
    b.onclick = () => {
      this.closeMessenger()
    }
    // fill with svg icon cross
    b.innerHTML
      = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256zM175 208.1L222.1 255.1L175 303C165.7 312.4 165.7 327.6 175 336.1C184.4 346.3 199.6 346.3 208.1 336.1L255.1 289.9L303 336.1C312.4 346.3 327.6 346.3 336.1 336.1C346.3 327.6 346.3 312.4 336.1 303L289.9 255.1L336.1 208.1C346.3 199.6 346.3 184.4 336.1 175C327.6 165.7 312.4 165.7 303 175L255.1 222.1L208.1 175C199.6 165.7 184.4 165.7 175 175C165.7 184.4 165.7 199.6 175 208.1V208.1z"/></svg>'
    this.ifrm.contentDocument.body.appendChild(b)
  }

  private setAutoHide() {
    if (!this.ifrm.contentWindow)
      return
    this.ifrm.contentWindow.$crisp.push(
      // ['safe', true],
      ['do', 'chat:open'],
      [
        'on',
        'chat:closed',
        () => {
          if (!this.ifrm.contentWindow)
            return
          this.closeMessenger()
        },
      ],
      [
        'on',
        'message:received',
        () => {
          this.openMessenger()
        },
      ],
    )
  }

  private push(...args: unknown[]) {
    if (!this.ifrm.contentWindow?.$crisp || !this.isReady) {
      // console.log('crisp not ready yet')
      this.tmpArr.push(...args)
      return
    }
    else {
      this.tmpArr.forEach((arg) => {
        this.ifrm.contentWindow?.pushToCrisp(JSON.stringify(arg))
      })
      this.tmpArr.length = 0
    }
    args.forEach((arg) => {
      this.ifrm.contentWindow?.pushToCrisp(JSON.stringify(arg))
    })
  }

  async configure(data: { websiteID: string }): Promise<void> {
    if (this.ifrm.contentWindow)
      this.ifrm.contentWindow.CRISP_WEBSITE_ID = data.websiteID
    window.CRISP_WEBSITE_ID = data.websiteID
  }

  async closeMessenger(): Promise<void> {
    this.ifrm.style.visibility = 'hidden'
  }

  async openMessenger(): Promise<void> {
    this.ifrm.style.visibility = 'visible'
    this.ifrm.style.display = 'block'
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
    const arr = [
      ...(data.nickname ? [['set', 'user:nickname', data.nickname]] : []),
      ...(data.phone ? [['set', 'user:phone', data.phone]] : []),
      ...(data.email ? [['set', 'user:email', data.email]] : []),
      ...(data.avatar ? [['set', 'user:avatar', data.avatar]] : []),
    ]
    this.push(...arr)
  }

  async pushEvent(data: { name: string; color: eventColor }): Promise<void> {
    this.push(['set', 'session:event', [[[data.name, null, data.color]]]])
  }

  async setCompany(data: {
    name: string
    url?: string
    description?: string
    employment?: [title: string, role: string]
    geolocation?: [country: string, city: string]
  }): Promise<void> {
    const meta = {
      ...(data.url && { url: data.url }),
      ...(data.description && { description: data.description }),
      ...(data.employment && { employment: data.employment }),
      ...(data.geolocation && { geolocation: data.geolocation }),
    }

    this.push(['set', 'user:company', [data.name, meta]])
  }

  async setInt(data: { key: string; value: number }): Promise<void> {
    this.push(['set', 'session:data', [data.key, data.value]])
  }

  async setString(data: { key: string; value: string }): Promise<void> {
    this.push(['set', 'session:data', [data.key, data.value]])
  }

  async sendMessage(data: { value: string }): Promise<void> {
    this.push(['do', 'message:send', ['text', data.value]])
  }

  async setSegment(data: { segment: string }): Promise<void> {
    this.push(['set', 'session:segments', [[data.segment]]])
  }

  async reset(): Promise<void> {
    this.push(['do', 'session:reset'])
  }
}
