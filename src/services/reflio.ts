declare global {
  interface Window {
    Reflio: any
  }
}
export function reflioLoader() {
  if (window.Reflio)
    return

  window.Reflio = true
  const d = document
  const t = 'script'
  const BASE_URL = 'https://reflio.com/js/reflio.min.js'
  const g = d.createElement(t) as any
  const s = d.getElementsByTagName(t)[0] as any
  g.src = BASE_URL
  g.defer = true
  g.async = true
  g.setAttribute('data-reflio', 'hi8q6z93wyt147h')
  g.setAttribute('data-domain', 'https://capgo.app,https://web.capgo.app')
  s.parentNode.insertBefore(g, s)
}
