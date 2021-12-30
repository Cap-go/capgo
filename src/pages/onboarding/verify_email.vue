
<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import type { User } from '@supabase/gotrue-js'
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { v4 as uuidv4 } from 'uuid'
import { useSupabase } from '~/services/supabase'

const supabase = useSupabase()
const route = useRoute()
const router = useRouter()

const isLoading = ref(true)

const { t } = useI18n()
const user = ref<User | null>(null)

const updateDb = async() => {
  console.log('update db')
  let session = supabase.auth.session()!

  if (!session && route.hash) {
    const queryString = route.hash.replace('#', '')
    const urlParams = new URLSearchParams(queryString)
    const refresh_token = urlParams.get('refresh_token')
    const logSession = await supabase.auth.signIn({
      refreshToken: refresh_token || '',
    })
    if (logSession.session)
      session = logSession.session
    if (logSession.user)
      user.value = logSession.user
  }
  else {
    console.log('session user', session?.user)
    user.value = session.user
  }

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
  const { error: error2 } = await supabase
    .from('apikeys')
    .insert(
      {
        user_id: user.value?.id,
        key: uuidv4(),
      },
    )
  if (error)
    console.log('updateDb', error)
  if (error2)
    console.log('updateDb', error2)
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
      {{ t('onboarding.loading') }}
    </IonContent>
  </IonPage>
</template>
