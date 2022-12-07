import Plausible from 'plausible-tracker'
import { isPlatform } from '@ionic/vue'
import { isSpoofed } from './supabase'

export const trackEvent = (domain: string, eventName: string, eventData: any = {}) => {
  if (isSpoofed())
    return
  const { trackEvent } = Plausible({
    trackLocalhost: isPlatform('capacitor'),
    domain,
  })
  trackEvent(eventName, { props: eventData })
}

export const initPlausible = (domain: string): void => {
  if (isSpoofed())
    return
  const { enableAutoPageviews } = Plausible({
    trackLocalhost: isPlatform('capacitor'),
    domain,
  })
  enableAutoPageviews()
}
