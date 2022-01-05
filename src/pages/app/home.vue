<script setup lang="ts">
import { IonContent, IonHeader, IonItem, IonItemDivider, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/vue'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const supabase = useSupabase()
const auth = supabase.auth.user()
const apps = ref<definitions['apps'][]>()
const openPackage = (appId: string) => {
  router.push(`/app/package/${appId.replaceAll('.', '--')}`)
}
watchEffect(async() => {
  if (route.path === '/app/home') {
    const { data } = await supabase
      .from<definitions['apps']>('apps')
      .select()
      .eq('user_id', auth?.id)
    if (data && data.length)
      apps.value = data
  }
})
</script>
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('projects.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">
            {{ t('projects.title') }}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        <ion-item-divider>
          <ion-label>
            {{ t('projects.list') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-for="(app, index) in apps" :key="index" @click="openPackage(app.app_id)">
          <div slot="start" class="col-span-2 relative py-4">
            <img :src="app.icon_url" alt="bebe" class="rounded-xl h-15 w-15 object-cover">
          </div>
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-bright-cerulean-500">
                  {{ app.name }}
                </h2>
              </div>
              <div class="flex justify-between items-center">
                <h3 v-if="app.last_version" class="text-true-gray-800 py-1 font-bold">
                  Last version: {{
                    app.last_version
                  }}
                </h3>
                <h3 v-else class="text-true-gray-800 py-1 font-bold">
                  No version upload yet
                </h3>
              </div>
            </div>
          </IonLabel>
        </IonItem>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<route lang="yaml">
meta:
  option: tabs
</route>
