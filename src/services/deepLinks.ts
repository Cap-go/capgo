import type { Router } from 'vue-router'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { parsePreviewDeepLink } from '~/services/previewLinks'

function routePreviewLink(router: Router, url: string) {
  void router.push({
    path: '/scan',
    query: { preview: url },
  }).catch((error: unknown) => {
    console.warn('Failed to route preview deep link', error)
  })
}

function routeWebLink(router: Router, url: URL) {
  void router.push(`${url.pathname}${url.search}${url.hash}`).catch((error: unknown) => {
    console.warn('Failed to route web deep link', error)
  })
}

function isCapgoConsoleHost(hostname: string) {
  return hostname === 'console.capgo.app' || /^console\.(?:dev|preprod|staging)\.capgo\.app$/.test(hostname)
}

function handleDeepLink(router: Router, rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  }
  catch {
    return
  }

  if (parsePreviewDeepLink(rawUrl)) {
    routePreviewLink(router, rawUrl)
    return
  }

  if (url.protocol === 'https:' && isCapgoConsoleHost(url.hostname))
    routeWebLink(router, url)
}

export async function installDeepLinkHandler(router: Router) {
  if (!Capacitor.isNativePlatform())
    return

  await CapacitorApp.addListener('appUrlOpen', (event) => {
    handleDeepLink(router, event.url)
  })

  const launchUrl = await CapacitorApp.getLaunchUrl()
  if (launchUrl?.url)
    handleDeepLink(router, launchUrl.url)
}
