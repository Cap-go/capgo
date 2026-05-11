const externalWindowFeatures = 'noopener,noreferrer'

export function openExternalLink(url?: string): void {
  if (!url || typeof globalThis.window === 'undefined')
    return

  const openedWindow = globalThis.window.open(url, '_blank', externalWindowFeatures)
  if (openedWindow)
    openedWindow.opener = null
}
