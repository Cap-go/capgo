import posthog from 'posthog-js'
import { isLocal } from '~/services/supabase'
import 'posthog-js/dist/recorder'
import 'posthog-js/dist/surveys'
import 'posthog-js/dist/exception-autocapture'
import 'posthog-js/dist/tracing-headers'
import 'posthog-js/dist/web-vitals'

export function posthogLoader(supaHost: string) {
  if (isLocal(supaHost))
    return
  posthog.init('phc_NXDyDajQaTQVwb25DEhIVZfxVUn4R0Y348Z7vWYHZUi', {
    api_host: 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    disable_external_dependency_loading: true,
  })
}

export function pushEvent(nameEvent: string, supaHost: string): void {
  if (isLocal(supaHost))
    return
  posthog.capture(nameEvent)
}

export function setUser(uuid: string, data: {
  nickname?: string
  phone?: string
  email?: string
  avatar?: string
}, supaHost: string): void {
  if (isLocal(supaHost))
    return
  // console.log('setUser')
  posthog.identify(
    uuid,
    { email: data.email, name: data.nickname },
  )
  posthog.setPersonProperties(
    { avatar: data.avatar },
  )
}

export function reset(supaHost: string): void {
  if (isLocal(supaHost))
    return
  posthog.reset()
}
