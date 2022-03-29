<script setup lang="ts">
import { IonContent, IonItem, IonItemDivider, IonLabel, IonList, IonPage, toastController } from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import copy from 'copy-text-to-clipboard'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import TitleHead from '~/components/TitleHead.vue'
import Spinner from '~/components/Spinner.vue'
import { createKeys } from '~/services/apikeys'

const { t } = useI18n()
const isLoading = ref(false)
const route = useRoute()
const supabase = useSupabase()
const auth = supabase.auth.user()
const apps = ref<definitions['apikeys'][]>()
const copyKey = async(app: definitions['apikeys']) => {
  copy(app.key)
  const toast = await toastController
    .create({
      message: t('apikeys.keyCopied'),
      duration: 2000,
    })
  await toast.present()
}
const openLink = (link: string) => {
  window.open(link, '_system')
}
const geKeys = async(retry = true): Promise<void> => {
  isLoading.value = true
  const { data } = await supabase
    .from<definitions['apikeys']>('apikeys')
    .select()
    .eq('user_id', auth?.id)
  if (data && data.length) {
    apps.value = data
  }
  else if (retry && auth?.id) {
    await createKeys(auth?.id)
    return geKeys(false)
  }
  isLoading.value = false
}
watchEffect(async() => {
  if (route.path === '/app/apikeys')
    await geKeys()
})
</script>
<template>
  <ion-page>
    <ion-content :fullscreen="true">
      <div class="mx-auto w-full lg:w-1/2">
        <div class="py-16 px-6">
          <TitleHead :big="false" :title="t('apikeys.title')" />
          <p class="m-3">
            {{ t('apikeys.explain') }}
          </p>
          <p class="m-3">
            {{ t('apikeys.checkbelow') }}
          </p>
          <ion-list>
            <ion-item-divider>
              <ion-label>
                {{ t('apikeys.links') }}
              </ion-label>
            </ion-item-divider>
            <IonItem class="cursor-pointer" @click="openLink('https://www.npmjs.com/package/capgo')">
              <IonLabel>
                <h2 class="text-sm text-azure-500">
                  {{ t('apikeys.cli') }}
                </h2>
              </IonLabel>
            </IonItem>
            <IonItem class="cursor-pointer" @click="openLink('https://www.npmjs.com/package/capacitor-updater')">
              <IonLabel>
                <h2 class="text-sm text-azure-500">
                  {{ t('apikeys.updater') }}
                </h2>
              </IonLabel>
            </IonItem>
            <ion-item-divider>
              <ion-label>
                {{ t('apikeys.all') }}
              </ion-label>
            </ion-item-divider>
            <div v-if="isLoading" class="flex justify-center">
              <Spinner />
            </div>
            <IonItem v-for="(app, index) in apps" v-else :key="index" @click="copyKey(app)">
              <IonLabel class="cursor-pointer">
                <div class="col-span-6 flex flex-col ">
                  <div class="flex justify-between items-center">
                    <h2 class="text-sm text-azure-500">
                      {{ app.key }}
                    </h2>
                  </div>
                  <div class="flex justify-between items-center">
                    <h3 class="text-true-gray-800 py-1 font-bold">
                      {{
                        app.mode
                      }}
                    </h3>
                  </div>
                </div>
              </IonLabel>
            </IonItem>
          </ion-list>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<route lang="yaml">
meta:
  option: tabs
</route>
