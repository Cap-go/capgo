import type { definitions } from '~/types/supabase'
import type { UserModule } from '~/types'
import { useMainStore } from '~/stores/main'
import { isCanceled, isGoodPlan, isPaying, isTrial, useSupabase } from '~/services/supabase'
import { setUser, setUserId } from '~/services/crips'
import { useLogSnag } from '~/services/logsnag'
import { hideLoader } from '~/services/loader'

const guard = async (next: any, to: string, from: string) => {
  const supabase = useSupabase()
  const auth = supabase.auth.user()
  const snag = useLogSnag()

  const main = useMainStore()

  if (auth && !main.auth) {
    main.auth = auth
    // console.log('set auth', auth)
    if (!main.user && auth) {
      try {
        isTrial(auth?.id).then((res) => {
          // console.log('isTrial', res)
          main.trialDaysLeft = res
        })
        isPaying(auth?.id).then((res) => {
          main.paying = res
        })
        isGoodPlan(auth?.id).then((res) => {
          main.goodPlan = res
        })
        isCanceled(auth?.id).then((res) => {
          main.canceled = res
        })
        const { data, error } = await supabase
          .from<definitions['users']>('users')
          .select()
          .eq('id', auth?.id)
          .single()
        if (!error && data)
          main.user = data
        else return next('/onboarding/verify_email')
        snag.publish({
          channel: 'user-login',
          event: 'User Login',
          icon: '✅',
          tags: {
            'user-id': data.id,
          },
          notify: false,
        }).catch()
        setUser({
          nickname: `${data.first_name} ${data.last_name}`,
          email: data.email,
          avatar: data.image_url,
        })
      }
      catch (error) {
        console.error('auth', error)
      }
    }
    setUserId(auth.id)

    if ((!auth.user_metadata?.activation || !auth.user_metadata?.activation.legal) && !to.includes('/onboarding') && !from.includes('/onboarding'))
      next('/onboarding/activation')
    else
      next()
    hideLoader()
  }
  else if (from !== 'login' && !auth && to !== '/home') {
    main.auth = null
    next('/login')
  }
  else {
    hideLoader()
    next()
  }
}

// // vueuse/head https://github.com/vueuse/head
export const install: UserModule = ({ router }) => {
  router.beforeEach(async (to, from, next) => {
    if (to.meta.middleware) { await guard(next, to.path, from.path) }
    else {
      hideLoader()
      next()
    }
  })
}
