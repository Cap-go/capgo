import Plausible from 'plausible-tracker'
import { Capacitor } from '@capacitor/core'
import { isSpoofed } from './supabase'

export function trackEvent(domain: string, eventName: string, eventData: any = {}) {
  if (isSpoofed())
    return
  const { trackEvent } = Plausible({
    trackLocalhost: Capacitor.isNativePlatform(),
    domain,
  })
  trackEvent(eventName, { props: eventData })
}

export function initPlausible(domain: string): void {
  if (isSpoofed())
    return
  const { enableAutoPageviews } = Plausible({
    trackLocalhost: Capacitor.isNativePlatform(),
    domain,
  })
  enableAutoPageviews()
}
