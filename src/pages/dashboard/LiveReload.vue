<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useDisplayStore } from '~/stores/display'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const main = useMainStore()
const supabase = useSupabase()
const iframe = ref('')
const displayStore = useDisplayStore()
const isMobile = Capacitor.isNativePlatform()

function waitLive() {
  console.log('wait log', main.user?.id)
  const listener = supabase
    .channel('table-app_live-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'app_live',
        filter: `id=eq.${main.user?.id}`,
      },
      (payload) => {
        console.log('payload', payload)
        if (payload.new.url) {
          console.log('stop listen')
          iframe.value = payload.new.url
          listener.unsubscribe()
        }
      },
    )
    .subscribe()
}

displayStore.NavTitle = ''
// try to access supabase app_live
supabase
  .from('app_live')
  .select()
  .eq('id', main.user?.id)
  .single()
  .then(({ data, error }) => {
    if (error)
      console.log('error', error)

    if (data) {
      iframe.value = data.url
    }
    else {
      // watch for changes in supabase app_live
      waitLive()
    }
  })
</script>

<template>
  <div class="w-full h-full px-4 py-8 mx-auto max-w-9xl lg:px-8 sm:px-6">
    <!-- Page header -->
    <div class="mb-8">
      <!-- Title -->
      <h1 class="text-2xl font-bold text-slate-800 md:text-3xl dark:text-white">
        {{ t('live-reload') }}
      </h1>
      <p>{{ t('use-the-command') }} <span class="font-bold"> npx @capgo/cli app watch [PORT]</span> {{ t('to-live-reload') }}</p>
      <p v-if="!isMobile">
        <a class="text-blue-600 underline" href="https://capgo.app/app_mobile/">Test</a> in the mobile app, no need to Xcode or Android studio
      </p>
    </div>
    <div class="flex flex-col">
      <div class="relative border-[8px] lg:border-[14px] border-black rounded-3xl lg:rounded-[3.5rem] w-64 lg:w-80 xl:w-96 aspect-[9/19] overflow-hidden max-w-sm mx-auto transitionfix">
        <div class="absolute inset-0 z-10">
          <iframe v-if="iframe" :src="iframe" class="w-full h-full" />
          <div v-else class="flex flex-col items-center justify-center h-full">
            <Spinner size="w-40 h-40" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
