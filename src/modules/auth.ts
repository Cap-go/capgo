import { isSpoofed, spoofUser } from './../services/supabase'
import type { UserModule } from '~/types'
import { useMainStore } from '~/stores/main'
import { isAllowedAction, isCanceled, isGoodPlan, isPaying, isTrial, useSupabase } from '~/services/supabase'
import { setUser } from '~/services/chatwoot'
import { useLogSnag } from '~/services/logsnag'
import { hideLoader } from '~/services/loader'
import { initStunning } from '~/services/stunning'

async function guard(next: any, to: string, from: string) {
  const supabase = useSupabase()
  const { data: auth } = await supabase.auth.getUser()

  const snag = useLogSnag()

  const main = useMainStore()
  
  if (auth.user && !main.auth) {
    if (isSpoofed())
      auth.user.id = spoofUser()
    main.auth = auth.user
    // console.log('set auth', auth)
    if (!main.user) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select()
          .eq('id', main.auth?.id)
          .single()
        if (!error && data)
          main.user = data
        else
          return next('/onboarding/verify_email')
      }
      catch (error) {
        console.error('auth', error)
        return next('/onboarding/verify_email')
      }
    }
    initStunning(main.user?.customer_id)
    isTrial(main.user?.id).then((res) => {
      // console.log('isTrial', res)
      main.trialDaysLeft = res
    })
    isPaying(main.user.id).then((res) => {
      main.paying = res
    })
    isAllowedAction(main.user?.id).then((res) => {
      main.canUseMore = res
    })
    isGoodPlan(main.user?.id).then((res) => {
      main.goodPlan = res
    })
    isCanceled(main.user?.id).then((res) => {
      main.canceled = res
    })

    snag.track({
      channel: 'user-login',
      event: 'User Login',
      icon: '✅',
      user_id: main.user.id,
      notify: false,
    }).catch()
    setUser(main.user.id, {
      nickname: `${main.user.first_name ?? ''} ${main.user.last_name ?? ''}`,
      email: main.user.email,
      avatar: main.user.image_url || '',
    })

    if ((!main.auth?.user_metadata?.activation || !main.auth?.user_metadata?.activation.legal) && !to.includes('/onboarding') && !from.includes('/onboarding'))
      next('/onboarding/activation')
    else
      next()
    hideLoader()
  }
  else if (from !== 'login' && !auth.user) {
    main.auth = undefined
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
    if (to.meta.middleware) {
      await guard(next, to.path, from.path)
    }
    else {
      hideLoader()
      next()
    }
  })
}
