const externalWindowFeatures = 'noopener,noreferrer'

export function openExternalLink(url?: string): void {
  if (!url || typeof window === 'undefined')
    return

  const openedWindow = window.open(url, '_blank', externalWindowFeatures)
  if (openedWindow)
    openedWindow.opener = null
}
