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

const { t } = useI18n()
const isLoading = ref(false)
const route = useRoute()
const supabase = useSupabase()
const auth = supabase.auth.user()
const apps = ref<definitions['apikeys'][]>()
const copyKey = async (app: definitions['apikeys']) => {
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
const geKeys = async (retry = true): Promise<void> => {
  isLoading.value = true
  const { data } = await supabase
    .from('apikeys')
    .select()
    .eq('user_id', auth?.id)
  if (data && data.length)
    apps.value = data

  else if (retry && auth?.id)
    return geKeys(false)

  isLoading.value = false
}
watchEffect(async () => {
  if (route.path === '/app/apikeys')
    await geKeys()
})
</script>

<template>
  <IonPage>
    <TitleHead :title="t('apikeys.title')" default-back="/app/account" />
    <IonContent :fullscreen="true">
      <div class="mx-auto w-full lg:w-1/2">
        <div class="py-16 px-6">
          <p class="m-3">
            {{ t('apikeys.explain') }}
          </p>
          <p class="m-3">
            {{ t('apikeys.checkbelow') }}
          </p>
          <IonList>
            <IonItemDivider>
              <IonLabel>
                {{ t('apikeys.links') }}
              </IonLabel>
            </IonItemDivider>
            <IonItem class="cursor-pointer" @click="openLink('https://www.npmjs.com/package/@capgo/cli')">
              <IonLabel>
                <h2 class="text-sm text-azure-500">
                  {{ t('apikeys.cli') }}
                </h2>
              </IonLabel>
            </IonItem>
            <IonItem class="cursor-pointer" @click="openLink('https://www.npmjs.com/package/@capgo/capacitor-updater')">
              <IonLabel>
                <h2 class="text-sm text-azure-500">
                  {{ t('apikeys.updater') }}
                </h2>
              </IonLabel>
            </IonItem>
            <IonItemDivider>
              <IonLabel>
                {{ t('apikeys.all') }}
              </IonLabel>
            </IonItemDivider>
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
          </IonList>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
