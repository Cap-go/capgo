import type { SupabaseClient } from '@supabase/supabase-js'
import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import type { UserModule } from '~/types'
import { hideLoader } from '~/services/loader'
import { setUser } from '~/services/posthog'
import { sanitizeText } from '~/services/sanitize'
import { getLocalConfig, useSupabase } from '~/services/supabase'
import { sendEvent } from '~/services/tracking'
import { useMainStore } from '~/stores/main'
import { getPlans, isAdmin } from './../services/supabase'

async function updateUser(
  main: ReturnType<typeof useMainStore>,
  supabase: SupabaseClient,
) {
  const config = getLocalConfig()
  // console.log('set auth', auth)
  try {
    const { data, error } = await supabase
      .from('users')
      .select()
      .eq('id', main.auth?.id)
      .maybeSingle()

    let userRecord = data ?? null

    if (error && error.code !== 'PGRST116')
      console.error('Failed to fetch public user profile', error)

    if (!userRecord && main.auth) {
      const sanitizedFirstName = sanitizeText(main.auth.user_metadata?.first_name ?? '')
      const sanitizedLastName = sanitizeText(main.auth.user_metadata?.last_name ?? '')
      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert({
          id: main.auth.id,
          email: main.auth.email ?? '',
          first_name: sanitizedFirstName,
          last_name: sanitizedLastName,
          country: null,
          enable_notifications: true,
          opt_for_newsletters: true,
        })
        .select()
        .single()

      if (insertError) {
        console.error('Failed to create public user profile', insertError)
      }
      else {
        userRecord = inserted
      }
    }

    if (!userRecord)
      return

    if (main.auth?.email && userRecord.email !== main.auth?.email) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ email: main.auth?.email })
        .eq('id', main.auth?.id)
      if (updateError)
        console.error('update error', updateError)
      userRecord.email = main.auth?.email
    }

    main.user = userRecord
    setUser(
      main.auth?.id ?? '',
      {
        email: userRecord.email,
        nickname: [userRecord.first_name, userRecord.last_name].filter(Boolean).join(' ') || undefined,
        avatar: userRecord.image_url ?? undefined,
      },
      config.supaHost,
    )
  }
  catch (error) {
    console.error('auth', error)
  }
}

async function guard(
  next: NavigationGuardNext,
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
) {
  const supabase = useSupabase()
  const { data: claimsData } = await supabase.auth.getClaims()
  const { data: sessionData } = await supabase.auth.getSession()
  const sessionUser = sessionData?.session?.user ?? null
  const hasAuth = !!claimsData?.claims?.sub && !!sessionUser

  const main = useMainStore()

  // TOTP means the user was force logged using the "email" tactic
  // In practice this means the user is being spoofed by an admin
  const isAdminForced
    = !!sessionUser?.factors?.find(f => f.factor_type === 'totp') || false

  const { data: mfaData, error: mfaError }
    = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (mfaError) {
    console.error('Cannot guard auth', mfaError)
    return
  }

  if (
    mfaData.currentLevel === 'aal1'
    && mfaData.nextLevel === 'aal2'
    && !isAdminForced
  ) {
    return next(`/login?to=${to.path}`)
  }

  if (hasAuth && sessionUser && !main.auth) {
    main.auth = sessionUser

    // Check if account is disabled (marked for deletion)
    try {
      const { data: isDisabled, error: disabledError } = await supabase
        .rpc('is_account_disabled', { user_id: sessionUser.id })

      if (disabledError) {
        console.error('Error checking account status:', disabledError)
      }
      else if (isDisabled) {
        // Account is disabled, redirect to account disabled page
        return next('/accountDisabled')
      }
    }
    catch (error) {
      console.error('Error checking if account is disabled:', error)
    }

    if (!main.user) {
      await updateUser(main, supabase)
    }

    getPlans().then((pls) => {
      main.plans = pls
    })

    isAdmin(main.auth?.id).then((res) => {
      main.isAdmin = res
    })

    sendEvent({
      channel: 'user-login',
      event: 'User Login',
      icon: '✅',
      user_id: main.auth?.id,
      notify: false,
    }).catch()

    next()
    hideLoader()
  }
  else if (from.path !== 'login' && !hasAuth) {
    main.auth = undefined
    next(`/login?to=${to.path}`)
  }
  else if (hasAuth && main.auth) {
    // User is already authenticated, but check if account got disabled
    // (only if not already on account disabled page)
    if (to.path !== '/accountDisabled') {
      try {
        const { data: isDisabled, error: disabledError } = await supabase
          .rpc('is_account_disabled', { user_id: main.auth.id })

        if (disabledError) {
          console.error('Error checking account status:', disabledError)
        }
        else if (isDisabled) {
          // Account is disabled, redirect to account disabled page
          return next('/accountDisabled')
        }
      }
      catch (error) {
        console.error('Error checking if account is disabled:', error)
      }
    }

    // Check if user is trying to access admin routes
    if (to.path.startsWith('/admin')) {
      // Ensure isAdmin is loaded before checking
      if (main.isAdmin === undefined) {
        const adminStatus = await isAdmin(main.auth.id)
        main.isAdmin = adminStatus
      }

      // Redirect non-admin users to dashboard
      if (!main.isAdmin) {
        console.warn('Non-admin user attempted to access admin route:', to.path)
        return next('/dashboard')
      }
    }

    hideLoader()
    next()
  }
  else {
    hideLoader()
    next()
  }
}

export const install: UserModule = ({ router }) => {
  router.beforeEach(async (to, from, next) => {
    if (to.meta.middleware) {
      await guard(next, to, from)
    }
    else {
      hideLoader()
      next()
    }
  })
}
