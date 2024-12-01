import type { UserModule } from '~/types'
import { setUser } from '~/services/bento'
import { hideLoader } from '~/services/loader'
import { useSupabase } from '~/services/supabase'
import { sendEvent } from '~/services/tracking'
import { useMainStore } from '~/stores/main'
import { getPlans, isAdmin } from './../services/supabase'

async function guard(next: any, to: string, from: string) {
  const supabase = useSupabase()
  const { data: auth } = await supabase.auth.getUser()

  const main = useMainStore()

  // TOTP means the user was force logged using the "email" tactic
  // In practice this means the user is beeing spoofed by an admin
  const isAdminForced = !!auth.user?.factors?.find(f => f.factor_type === 'totp') || false

  const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (mfaError) {
    console.error('Cannot guard auth', mfaError)
    return
  }

  if (mfaData.currentLevel === 'aal1' && mfaData.nextLevel === 'aal2' && !isAdminForced)
    return next(`/login?to=${to}`)

  if (auth.user && !main.auth) {
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

    getPlans().then((pls) => {
      main.plans = pls
    })

    // TODO: fix stunning to work with orgs custiner id
    // initStunning(main.user?.customer_id)
    isAdmin(main.auth?.id).then((res) => {
      main.isAdmin = res
    })

    sendEvent({
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
    next(`/login?to=${to}`)
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
