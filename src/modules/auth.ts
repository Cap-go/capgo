import type { definitions } from '~/types/supabase'
import type { UserModule } from '~/types'
import { useMainStore } from '~/stores/main'
import { useSupabase } from '~/services/supabase'
import { setUser, setUserId } from '~/services/crips'
import type { PlanRes } from '~/services/plans'

const guard = async (next: any, to: string, from: string) => {
  const supabase = useSupabase()
  const auth = supabase.auth.user()

  const main = useMainStore()

  if (auth && !main.auth) {
    main.auth = auth
    if (!main.user && auth) {
      try {
        supabase.functions.invoke<PlanRes>('payment_status', {})
          .then((res) => {
            console.log('payment_status', res)
            if (res.data)
              main.myPlan = res.data
          }).catch((err) => {
            console.log('error payment_status', err)
          })
        const { data, error } = await supabase
          .from<definitions['users']>('users')
          .select()
          .eq('id', auth?.id)
          .limit(1)
          .single()
        if (!error && data)
          main.user = data
        else return next('/onboarding/verify_email')
        setUser({
          nickname: `${data.first_name} ${data.last_name}`,
          email: data.email,
          avatar: data.image_url,
        })
      }
      catch (error) {
        console.log('error', error)
      }
    }
    setUserId(auth.id)

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
  router.beforeEach(async (to, from, next) => {
    if (to.meta.middleware)
      await guard(next, to.path, from.path)
    else
      next()
  })
}
