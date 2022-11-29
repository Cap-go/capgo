import Plausible from 'plausible-tracker'
import { isPlatform } from '@ionic/vue'

export const trackEvent = (domain: string, eventName: string, eventData: any = {}) => {
  if (localStorage.getItem('supabase.old_id'))
    return
  const { trackEvent } = Plausible({
    trackLocalhost: isPlatform('capacitor'),
    domain,
  })
  trackEvent(eventName, { props: eventData })
}

export const initPlausible = (domain: string): void => {
  if (localStorage.getItem('supabase.old_id'))
    return
  const { enableAutoPageviews } = Plausible({
    trackLocalhost: isPlatform('capacitor'),
    domain,
  })
  enableAutoPageviews()
}
