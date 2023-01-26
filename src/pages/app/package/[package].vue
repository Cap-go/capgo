<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import Usage from '~/components/dashboard/Usage.vue'
import type { Database } from '~/types/supabase.types'

const route = useRoute()
const supabase = useSupabase()
const id = ref('')
const isLoading = ref(false)
const app = ref<Database['public']['Tables']['apps']['Row']>()
const channels = ref<(Database['public']['Tables']['channels']['Row'] & Channel)[]>([])

const loadAppInfo = async () => {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', id.value)
      .single()
    const { data: dataChannel } = await supabase
      .from('channels')
      .select(`
          id,
          name,
          app_id,
          public,
          version (
            name,
            created_at
          ),
          created_at,
          updated_at
          `)
      .eq('app_id', id.value)
      .order('updated_at', { ascending: false })
    app.value = dataApp || app.value
    channels.value = (dataChannel || channels.value) as (Database['public']['Tables']['channels']['Row'] & Channel)[]
  }
  catch (error) {
    console.error(error)
  }
}

const refreshData = async (evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    await loadAppInfo()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  evt?.target?.complete()
}

interface Channel {
  id: string
  version: {
    name: string
    created_at: string
  }
}
interface RefresherEventDetail {
  complete(): void
}
interface RefresherCustomEvent extends CustomEvent {
  detail: RefresherEventDetail
  target: HTMLIonRefresherElement
}

watchEffect(async () => {
  if (route.path.startsWith('/app/package')) {
    id.value = route.params.package as string
    id.value = id.value.replace(/--/g, '.')
    await refreshData()
  }
})
</script>

<template>
  <div v-if="isLoading" class="flex justify-center chat-items">
    <Spinner />
  </div>
  <div v-else class="h-full w-full">
    <div class="w-full h-full px-4 py-8  mb-8 overflow-y-scroll sm:px-6 lg:px-8 max-h-fit">
      <div class="grid gap-6 grid-cols-16 md:mx-10">
        <Usage :app-id="id" />
      </div>
      <div class="grid w-full grid-cols-1 gap-3 md:grid-cols-2 mt-5">
        <Channels :channels="channels" />
        <Devices :app-id="id" />
        <Versions :app-id="id" />
      </div>
    <!-- <IonList ref="listRef">
      <IonItem class="cursor-pointer" @click="openDevices()">
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('package.device_list') }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          <i-ion-chevron-forward-outline class="text-azure-500" />
        </IonNote>
      </IonItem>
      <IonItemDivider v-if="channels?.length">
        <IonLabel>
          {{ t('package.channels') }}
        </IonLabel>
      </IonItemDivider>
      <Channels :channels="channels" :open-channel="openChannel" :delete-channel="deleteChannel" />
      <IonItemDivider v-if="versions?.length">
        <IonLabel>
          {{ t('package.versions') }}
        </IonLabel>
      </IonItemDivider>
      <IonItem>
        <IonSearchbar @ion-change="search = ($event.detail.value || '').toLowerCase(); searchVersion()" />
      </IonItem>
      <template v-for="v in versionFilter" :key="v.name">
        <IonItemSliding>
          <IonItem button :detail="true" @click="openVersion(v)">
            <IonLabel>
              <h2 class="text-sm text-azure-500">
                {{ v.name }} ( {{ showSize(v) }} )
              </h2>
            </IonLabel>
            <IonNote slot="end">
              {{ formatDate(v.created_at || '') }}
            </IonNote>
          </IonItem>
          <IonItemOptions side="end">
            <IonItemOption color="warning" @click="deleteVersion(v)">
              Delete
            </IonItemOption>
          </IonItemOptions>
        </IonItemSliding>
      </template>
      <div v-if="isLoadingSub" class="flex justify-center chat-items">
        <Spinner />
      </div>
      <IonInfiniteScroll
        threshold="100px"
        :disabled="isDisabled || !!search"
        @ion-infinite="loadData($event)"
      >
        <IonInfiniteScrollContent
          loading-spinner="bubbles"
          :loading-text="t('loading-more-data')"
        />
      </IonInfiniteScroll>
    </IonList> -->
    </div>
  </div>
</template>

<style>
  #confirm-button {
    background-color: theme('colors.red.500');
    color: theme('colors.white');
  }
</style>
