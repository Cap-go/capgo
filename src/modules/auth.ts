import type { UserModule } from '~/types'
import { hideLoader } from '~/services/loader'
import { getLocalConfig, useSupabase } from '~/services/supabase'
import { sendEvent } from '~/services/tracking'
import { useMainStore } from '~/stores/main'
import { getPlans, isAdmin } from './../services/supabase'
import { setUser } from '~/services/posthog'

async function guard(next: any, to: string, from: string) {
  const supabase = useSupabase()
  const { data: auth } = await supabase.auth.getUser()

  const main = useMainStore()
  const config = getLocalConfig()

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
        if (!error && data) {
          console.log('set user', data)
          if (main.auth?.email && data.email !== main.auth?.email) {
            // update email after user updated is uath email
            const { error: updateError } = await supabase
              .from('users')
              .update({ email: main.auth?.email })
              .eq('id', main.auth?.id)
            if (updateError)
              console.error('update error', updateError)
            data.email = main.auth?.email
          }
          main.user = data
          setUser(main.auth?.id, {
            email: main.auth?.email,
            nickname: main.auth?.user_metadata?.nickname,
            avatar: main.auth?.user_metadata?.avatar_url,
          }, config.supaHost)
        }
        else {
          return next('/onboarding/verify_email')
        }
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
