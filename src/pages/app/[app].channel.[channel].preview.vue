<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconLock from '~icons/lucide/lock'
import IconSettings from '~icons/lucide/settings'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

interface ChannelPreview {
  version: Pick<Database['public']['Tables']['app_versions']['Row'], 'id' | 'manifest_count' | 'name' | 'session_key'> | null
}

const route = useRoute('/app/[app].channel.[channel].preview')
const router = useRouter()
const displayStore = useDisplayStore()
const { t } = useI18n()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const channel = ref<Database['public']['Tables']['channels']['Row'] & ChannelPreview>()
const app = ref<Database['public']['Tables']['apps']['Row']>()

type PreviewState = 'loading' | 'no-app' | 'no-manifest' | 'preview-disabled' | 'encrypted' | 'ready'
const previewState = ref<PreviewState>('loading')

async function getChannel() {
  if (!id.value)
    return

  try {
    const { data, error } = await supabase
      .from('channels')
      .select(`
        id,
        app_id,
        name,
        version:app_versions!channels_version_fkey(
          id,
          name,
          manifest_count,
          session_key
        )
      `)
      .eq('app_id', packageId.value)
      .eq('id', id.value)
      .single()

    if (error) {
      console.error('no channel', error)
      channel.value = undefined
      displayStore.NavTitle = t('channel')
      return
    }

    channel.value = data as unknown as Database['public']['Tables']['channels']['Row'] & ChannelPreview

    if (channel.value?.name)
      displayStore.setChannelName(String(channel.value.id), channel.value.name)
    displayStore.NavTitle = channel.value?.name ?? t('channel')
  }
  catch (error) {
    channel.value = undefined
    displayStore.NavTitle = t('channel')
    console.error(error)
  }
}

async function getApp() {
  try {
    const { data, error } = await supabase
      .from('apps')
      .select()
      .eq('app_id', packageId.value)
      .single()

    if (error) {
      console.error('no app', error)
      app.value = undefined
      return
    }

    app.value = data
  }
  catch (error) {
    app.value = undefined
    console.error(error)
  }
}

function determinePreviewState() {
  if (!channel.value) {
    previewState.value = 'loading'
    return
  }

  if (!app.value) {
    previewState.value = 'no-app'
    return
  }

  if (!app.value.allow_preview) {
    previewState.value = 'preview-disabled'
    return
  }

  if (!channel.value.version?.manifest_count) {
    previewState.value = 'no-manifest'
    return
  }

  if (channel.value.version.session_key) {
    previewState.value = 'encrypted'
    return
  }

  previewState.value = 'ready'
}

function goToAppSettings() {
  router.push(`/app/${packageId.value}/info`)
}

watchEffect(async () => {
  loading.value = true
  previewState.value = 'loading'
  channel.value = undefined
  app.value = undefined
  displayStore.NavTitle = t('channel')
  packageId.value = route.params.app as string
  id.value = Number(route.params.channel as string)
  await Promise.all([getChannel(), getApp()])
  determinePreviewState()
  loading.value = false
  displayStore.defaultBack = `/app/${packageId.value}/channel/${id.value}`
})
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col justify-center items-center min-h-[50vh]">
      <Spinner size="w-40 h-40" />
    </div>

    <div v-else-if="!channel" class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('channel-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('channel-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="router.push(`/app/${packageId}/channels`)">
        {{ t('back-to-channels') }}
      </button>
    </div>

    <div v-else-if="previewState === 'no-app'" class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('app-not-found') }}
      </h2>
      <p class="mt-2 text-center text-muted-foreground max-w-md">
        {{ t('app-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="router.push('/apps')">
        {{ t('back-to-apps') }}
      </button>
    </div>

    <div v-else-if="previewState === 'preview-disabled'" class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconSettings class="w-16 h-16 mb-4 text-muted-foreground" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('preview-disabled') }}
      </h2>
      <p class="mt-2 text-center text-muted-foreground max-w-md">
        {{ t('preview-disabled-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="goToAppSettings">
        {{ t('preview-enable-settings') }}
      </button>
    </div>

    <div v-else-if="previewState === 'no-manifest'" class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-amber-500" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('preview-not-available') }}
      </h2>
      <p class="mt-2 text-center text-muted-foreground max-w-md">
        {{ t('preview-no-manifest') }}
      </p>
    </div>

    <div v-else-if="previewState === 'encrypted'" class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconLock class="w-16 h-16 mb-4 text-amber-500" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('preview-encrypted') }}
      </h2>
      <p class="mt-2 text-center text-muted-foreground max-w-md">
        {{ t('preview-encrypted-description') }}
      </p>
    </div>

    <div v-else-if="previewState === 'ready'" class="w-full h-full">
      <BundlePreviewFrame
        :app-id="packageId"
        :channel-id="id"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
