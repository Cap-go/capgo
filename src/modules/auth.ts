import type { definitions } from '~/types/supabase'
import type { UserModule } from '~/types'
import { useMainStore } from '~/stores/main'
import { useSupabase } from '~/services/supabase'

const guard = async(next: any, to: string, from: string) => {
  const supabase = useSupabase()
  const auth = supabase.auth.user()

  const main = useMainStore()

  if (auth && !main.auth) {
    main.auth = auth
    if (!main.user) {
      try {
        const { data, error } = await supabase
          .from<definitions['users']>('users')
          .select(`
        id,
        country,
        image_url,
        first_name,
        last_name,
        image_url
      `)
          .match({ id: auth?.id })
        if (!error && data && data.length)
          main.user = data[0]
      }
      catch (error) {
        console.log('error', error)
      }
    }

    if ((!auth.user_metadata?.activation || !auth.user_metadata?.activation.legal) && !to.includes('/onboarding') && !from.includes('/onboarding')) next('/onboarding/activation')
    else next()
  }
  else if (from !== 'login' && !auth) {
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
