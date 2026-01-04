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

const route = useRoute()
const router = useRouter()
const displayStore = useDisplayStore()
const { t } = useI18n()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const version = ref<Database['public']['Tables']['app_versions']['Row']>()
const app = ref<Database['public']['Tables']['apps']['Row']>()

// Preview states
type PreviewState = 'loading' | 'no-manifest' | 'preview-disabled' | 'encrypted' | 'ready'
const previewState = ref<PreviewState>('loading')

async function getVersion() {
  if (!id.value)
    return

  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('id', id.value)
      .single()

    if (error) {
      console.error('no version', error)
      return
    }

    version.value = data

    if (version.value?.name)
      displayStore.setBundleName(String(version.value.id), version.value.name)
    displayStore.NavTitle = version.value?.name ?? t('bundle')
  }
  catch (error) {
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
      return
    }

    app.value = data
  }
  catch (error) {
    console.error(error)
  }
}

function determinePreviewState() {
  if (!version.value || !app.value) {
    previewState.value = 'loading'
    return
  }

  // Check if preview is disabled for the app
  if (!app.value.allow_preview) {
    previewState.value = 'preview-disabled'
    return
  }

  // Check if bundle has manifest
  if (!version.value.manifest_count || version.value.manifest_count === 0) {
    previewState.value = 'no-manifest'
    return
  }

  // Check if bundle is encrypted
  if (version.value.session_key) {
    previewState.value = 'encrypted'
    return
  }

  previewState.value = 'ready'
}

function goToAppSettings() {
  router.push(`/app/${packageId.value}/info`)
}

watchEffect(async () => {
  if (route.path.includes('/bundle/') && route.path.includes('/preview')) {
    loading.value = true
    previewState.value = 'loading'
    const params = route.params as { package: string, bundle: string }
    packageId.value = params.package
    id.value = Number(params.bundle)
    await Promise.all([getVersion(), getApp()])
    determinePreviewState()
    loading.value = false
    if (!version.value?.name)
      displayStore.NavTitle = t('bundle')
    displayStore.defaultBack = `/app/${params.package}/bundles`
  }
})
</script>

<template>
  <div>
    <!-- Loading State -->
    <div v-if="loading" class="flex flex-col justify-center items-center min-h-[50vh]">
      <Spinner size="w-40 h-40" />
    </div>

    <!-- Version Not Found -->
    <div v-else-if="!version" class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('bundle-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('bundle-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="router.push(`/app/${packageId}/bundles`)">
        {{ t('back-to-bundles') }}
      </button>
    </div>

    <!-- Preview Disabled State -->
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

    <!-- No Manifest State -->
    <div v-else-if="previewState === 'no-manifest'" class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-amber-500" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('preview-not-available') }}
      </h2>
      <p class="mt-2 text-center text-muted-foreground max-w-md">
        {{ t('preview-no-manifest') }}
      </p>
    </div>

    <!-- Encrypted State -->
    <div v-else-if="previewState === 'encrypted'" class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconLock class="w-16 h-16 mb-4 text-amber-500" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('preview-encrypted') }}
      </h2>
      <p class="mt-2 text-center text-muted-foreground max-w-md">
        {{ t('preview-encrypted-description') }}
      </p>
    </div>

    <!-- Ready State - Show Preview -->
    <div v-else-if="previewState === 'ready'" class="w-full h-full">
      <BundlePreviewFrame
        :app-id="packageId"
        :version-id="id"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
