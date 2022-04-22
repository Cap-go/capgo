<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon,
  IonItem, IonItemDivider, IonLabel, IonList, IonListHeader, IonNote,
  IonPage, IonTitle, IonToolbar,
} from '@ionic/vue'
import dayjs from 'dayjs'
import { chevronBack } from 'ionicons/icons'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'

interface Device {
  version: definitions['app_versions']
}
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<string>()
const device = ref<definitions['devices'] & Device>()

const formatDate = (date: string | undefined) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const getDevice = async() => {
  if (!id.value)
    return
  try {
    const { data } = await supabase
      .from<definitions['devices'] & Device>('devices')
      .select(`
          device_id,
          app_id,
          platform,
          version (
            name,
            app_id,
            bucket_id,
            created_at
          ),
          created_at,
          plugin_version,
          updated_at
        `)
      .eq('device_id', id.value)
    if (data && data.length)
      device.value = data[0]
    else
      console.log('no channel')
    console.log('channel', device.value)
  }
  catch (error) {
    console.error(error)
  }
}
watchEffect(async() => {
  if (route.path.includes('/d/')) {
    packageId.value = route.params.p as string
    packageId.value = packageId.value.replaceAll('--', '.')
    id.value = route.params.device as string
    await getDevice()
  }
})
const back = () => {
  router.go(-1)
}
</script>
<template>
  <ion-page>
    <IonHeader class="header-custom">
      <IonToolbar class="toolbar-no-border">
        <IonButtons slot="start" class="mx-3">
          <IonButton @click="back">
            <IonIcon :icon="chevronBack" class="text-grey-dark" /> {{ t('button.back') }}
          </IonButton>
        </IonButtons>
        <IonTitle color="warning">
          {{ t('device.title') }}
        </IonTitle>
      </IonToolbar>
    </IonHeader>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title color="warning" size="large">
            {{ t('device.title') }}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        <ion-list-header>
          <span class="text-vista-blue-500">
            {{ device?.device_id }}
          </span>
        </ion-list-header>
        <ion-item-divider>
          <ion-label>
            {{ t('device.info') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.platform') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ device.platform }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.plugin_version') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ device.plugin_version }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.version') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ device.version.name }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.last_update') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ formatDate(device.updated_at) }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.created_at') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ formatDate(device.created_at) }}
          </IonNote>
        </IonItem>
      </ion-list>
    </ion-content>
  </ion-page>
</template>
