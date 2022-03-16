import Plausible from 'plausible-tracker'
import { isPlatform } from '@ionic/vue'

export const trackEvent = (eventName: string, eventData: any = {}) => {
  const { trackEvent } = Plausible({
    trackLocalhost: isPlatform('capacitor'),
    domain: 'captime.app',
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
