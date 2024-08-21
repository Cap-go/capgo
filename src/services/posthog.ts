import posthog from 'posthog-js'
import 'posthog-js/dist/recorder'
import 'posthog-js/dist/surveys'
import 'posthog-js/dist/exception-autocapture'
import 'posthog-js/dist/tracing-headers'
import 'posthog-js/dist/web-vitals'

export function posthigLoader() {
  posthog.init('phc_NXDyDajQaTQVwb25DEhIVZfxVUn4R0Y348Z7vWYHZUi', {
    api_host: 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    disable_external_dependency_loading: true,
  })
}

export function pushEvent(nameEvent: string): void {
  posthog.capture(nameEvent)
}

export function setUser(uuid: string, data: {
  nickname?: string
  phone?: string
  email?: string
  avatar?: string
}): void {
  // console.log('setUser')
  posthog.identify(
    uuid,
    { email: data.email, name: data.nickname },
  )
  posthog.setPersonProperties(
    { avatar: data.avatar },
  )
}

export function reset(): void {
  posthog.reset()
}
