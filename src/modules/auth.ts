import type { definitions } from '~/types/supabase'
import type { UserModule } from '~/types'
import { useMainStore } from '~/stores/main'
import { useSupabase } from '~/services/supabase'
import { setUser, setUserId } from '~/services/crips'
import { PlanRes } from '~/services/plans'

const guard = async(next: any, to: string, from: string) => {
  const supabase = useSupabase()
  const auth = supabase.auth.user()

  const main = useMainStore()

  if (auth && !main.auth) {
    main.auth = auth
    if (!main.user) {
      try {
        supabase.functions.invoke<PlanRes>('payment_status', {})
        .then((res) => {
          console.log('payment_status', res)
          if (res.data)
            main.myPlan = res.data
        })
        const { data, error } = await supabase
          .from<definitions['users']>('users')
          .select()
          .match({ id: auth?.id })
        if (!error && data && data.length)
          main.user = data[0]
        else
          return next('/onboarding/verify_email')
      }
      catch (error) {
        console.log('error', error)
      }
    }
    setUserId(auth.id)
    setUser({
      nickname: `${main.user?.first_name} ${main.user?.last_name}`,
      email: main.user?.email,
      avatar: main.user?.image_url,
    })

    if ((!auth.user_metadata?.activation || !auth.user_metadata?.activation.legal) && !to.includes('/onboarding') && !from.includes('/onboarding'))
      next('/onboarding/activation')
    else
      next()
  }
  else if (from !== 'login' && !auth && to !== '/home') {
    main.auth = null
    next('/login')
  }
  else { next() }
}

// // vueuse/head https://github.com/vueuse/head
export const install: UserModule = ({ router }) => {
  router.beforeEach(async(to, from, next) => {
    if (to.meta.middleware)
      await guard(next, to.path, from.path)
    else
      next()
  })
}
