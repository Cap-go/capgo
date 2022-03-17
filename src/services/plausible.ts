import Plausible from 'plausible-tracker'
import { isPlatform } from '@ionic/vue'

export const trackEvent = (domain: string, eventName: string, eventData: any = {}) => {
  const { trackEvent } = Plausible({
    trackLocalhost: isPlatform('capacitor'),
    domain,
  })
  trackEvent(eventName, { props: eventData })
}

export const initPlausible = (domain: string): void => {
  const { enableAutoPageviews } = Plausible({
    trackLocalhost: isPlatform('capacitor'),
    domain,
  })
  enableAutoPageviews()
}
