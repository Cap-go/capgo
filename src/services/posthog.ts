// @ts-nocheck
import { isLocal } from '~/services/supabase'

export function posthogLoader(supaHost: string) {
  if (isLocal(supaHost))
    return
  !(function (t, e) {
    let o, n, p, r
    e.__SV
    || ((window.posthog = e),
    (e._i = []),
    (e.init = function (i, s, a) {
      function g(t, e) {
        let o = e.split('.')
          ;(o.length == 2 && ((t = t[o[0]]), (e = o[1])),
        (t[e] = function () {
          t.push([e].concat(Array.prototype.slice.call(arguments, 0)))
        }))
      }
      ;(((p = t.createElement('script')).type = 'text/javascript'),
      (p.crossOrigin = 'anonymous'),
      (p.async = !0),
      (p.src = `${s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`),
      (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r))
      let u = e
      for (
        void 0 !== a ? (u = e[a] = []) : (a = 'posthog'),
        u.people = u.people || [],
        u.toString = function (t) {
          let e = 'posthog'
          return (a !== 'posthog' && (e += `.${a}`), t || (e += ' (stub)'), e)
        },
        u.people.toString = function () {
          return `${u.toString(1)}.people (stub)`
        },
        o
          = 'init Ie Ts Ms Ee Es Rs capture Ge calculateEventProperties Os register register_once register_for_session unregister unregister_for_session js getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty Ds Fs createPersonProfile Ls Ps opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing Cs debug I As getPageViewId captureTraceFeedback captureTraceMetric'.split(
            ' ',
          ),
        n = 0;
        n < o.length;
        n++
      )
        g(u, o[n])
      e._i.push([i, s, a])
    }),
    (e.__SV = 1))
  })(document, window.posthog || [])
  posthog.init('phc_NXDyDajQaTQVwb25DEhIVZfxVUn4R0Y348Z7vWYHZUi', {
    api_host: 'https://psthg.digitalshift-ee.workers.dev/',
    ui_host: 'https://eu.posthog.com',
    person_profiles: 'identified_only',
    defaults: '2025-11-30',
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
