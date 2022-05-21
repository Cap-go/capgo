<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote, IonPage, IonRefresher, IonRefresherContent, IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { chevronBack } from 'ionicons/icons'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { subDays } from 'date-fns'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'

interface Device {
  version: {
    name: string
  }
}
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const id = ref('')
const search = ref('')
const isLoading = ref(true)
const devices = ref<(definitions['devices'] & Device)[]>([])

const deviceFiltered = computed(() => {
  const value = search.value
  if (value) {
    const filtered = devices.value.filter(device => device.device_id.toLowerCase().includes(value.toLowerCase()))
    return filtered
  }
  return devices.value
})

const loadData = async() => {
  try {
    const { data: dataDev } = await supabase
      .from<definitions['devices'] & Device>('devices')
      .select(`
        device_id,
        platform,
        plugin_version,
        version (
            name
        ),
        created_at,
        updated_at
      `)
      .eq('app_id', id.value)
      .gt('updated_at', subDays(new Date(), 30).toUTCString())
    devices.value = dataDev || devices.value
  }
  catch (error) {
    console.error(error)
  }
}

const refreshData = async(evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    await loadData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  evt?.target?.complete()
}

const openDevice = async(device: definitions['devices']) => {
  router.push(`/app/p/${id.value.replaceAll('.', '--')}/d/${device.device_id}`)
}

interface RefresherEventDetail {
  complete(): void
}
interface RefresherCustomEvent extends CustomEvent {
  detail: RefresherEventDetail
  target: HTMLIonRefresherElement
}

watchEffect(async() => {
  if (route.path.endsWith('/devices')) {
    id.value = route.params.p as string
    id.value = id.value.replaceAll('--', '.')
    await refreshData()
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
          {{ t('devices.title') }}
        </IonTitle>
      </IonToolbar>
      <ion-toolbar v-if="!isLoading">
        <ion-searchbar @ion-change="search = $event.detail.value" />
      </ion-toolbar>
    </IonHeader>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ion-refresh="refreshData($event)">
        <ion-refresher-content />
      </ion-refresher>
      <div v-if="isLoading" class="chat-items flex justify-center">
        <Spinner />
      </div>
      <div v-else>
        <ion-list>
          <template v-for="d in deviceFiltered" :key="d.device_id">
            <IonItem class="cursor-pointer" @click="openDevice(d)">
              <IonLabel>
                <h2 class="text-sm text-azure-500">
                  {{ d.device_id }} {{ d.platform }} {{ d.version.name }}
                </h2>
              </IonLabel>
              <IonNote slot="end">
                {{ formatDate(d.updated_at) }}
              </IonNote>
            </IonItem>
          </template>
        </ion-list>
      </div>
    </ion-content>
  </ion-page>
</template>
