// First-touch attribution capture.
// Stores the earliest marketing signals (UTM params, click ids, referrer, landing URL)
// in localStorage so they can later be attached to the PostHog person with
// $set_once semantics (see setUser in ~/services/posthog).

const STORAGE_KEY = 'capgo_first_touch'
const SIGNAL_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'ref',
  'gclid',
  'fbclid',
] as const

type SignalParam = typeof SIGNAL_PARAMS[number]

export type FirstTouch = {
  captured_at: string
  landing_url: string
  referrer: string
} & Partial<Record<SignalParam, string>>

function isExternalReferrer(referrer: string): boolean {
  if (!referrer)
    return false
  try {
    return new URL(referrer).origin !== window.location.origin
  }
  catch {
    return false
  }
}

export function captureFirstTouch(): void {
  try {
    if (localStorage.getItem(STORAGE_KEY))
      return

    const search = new URLSearchParams(window.location.search)
    const params: Partial<Record<SignalParam, string>> = {}
    for (const key of SIGNAL_PARAMS) {
      const value = search.get(key)
      if (value)
        params[key] = value
    }

    const referrer = document.referrer
    const hasSignal = Object.keys(params).length > 0 || isExternalReferrer(referrer)
    if (!hasSignal)
      return

    const firstTouch: FirstTouch = {
      captured_at: new Date().toISOString(),
      landing_url: window.location.href,
      referrer,
      ...params,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(firstTouch))
  }
  catch (error) {
    console.error('Cannot capture first-touch attribution', error)
  }
}

export function getFirstTouch(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object')
      return null
    return parsed as FirstTouch
  }
  catch {
    return null
  }
}
