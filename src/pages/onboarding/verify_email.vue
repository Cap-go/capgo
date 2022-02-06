
<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import type { User } from '@supabase/gotrue-js'
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { autoAuth, useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import { createKeys } from '~/services/apikeys'

const supabase = useSupabase()
const route = useRoute()
const router = useRouter()

const isLoading = ref(true)

const user = ref<User | null>(null)

const updateDb = async() => {
  console.log('update db')
  let session = supabase.auth.session()!

  if (!session) {
    const logSession = await autoAuth()
    if (!logSession)
      return
    if (logSession.session)
      session = logSession.session
    if (logSession.user)
      user.value = logSession.user
  }
  else {
    console.log('session user', session?.user)
    user.value = session.user
  }
  if (!user.value?.id)
    return

  const { error } = await supabase
    .from('users')
    .insert(
      {
        id: user.value?.id,
        first_name: user.value?.user_metadata.first_name,
        last_name: user.value?.user_metadata.last_name,
        email: user.value?.email,
        image_url: '',
      },
    )
  await createKeys(user.value?.id)
  if (error)
    console.log('updateDb', error)
  router.push('/onboarding/activation')

  isLoading.value = false
}

watchEffect(() => {
  if (route.path === '/onboarding/verify_email') {
    setTimeout(async() => {
      await updateDb()
    }, 500)
  }
})
</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <section class="flex justify-center">
        <Spinner />
      </section>
    </IonContent>
  </IonPage>
</template>
