<script setup lang="ts">
import type { NativePackage } from '~/services/bundleCompatibility'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import IconTriangleAlert from '~icons/lucide/triangle-alert'
import { comparePackages, summarizeCompatibility } from '~/services/bundleCompatibility'
import { useSupabase } from '~/services/supabase'

const props = defineProps<{
  appId: string
  reloadTrigger?: number
}>()

const router = useRouter()
const { t } = useI18n()
const supabase = useSupabase()

interface IncompatibleWarning {
  currentBundleId: number
  currentBundleName: string
  previousBundleId: number
  previousBundleName: string
}

const warning = ref<IncompatibleWarning | null>(null)
// Guards a stale in-flight check from overwriting the result for a newer app / refresh.
let latestRequestToken = 0

function toNativePackages(value: unknown): NativePackage[] | null {
  return Array.isArray(value) ? (value as NativePackage[]) : null
}

// Frontend-only check: on the default download channel, compare the current
// bundle against the immediately previous one (from deploy_history). If their
// native dependencies are not OTA-compatible, surface a warning banner.
async function checkCompatibility() {
  const requestToken = ++latestRequestToken
  warning.value = null
  if (!props.appId)
    return

  // Default channel = the public download channel (matches ReleaseBanner/DeploymentBanner).
  const { data: channels } = await supabase
    .from('channels')
    .select('id')
    .eq('app_id', props.appId)
    .eq('public', true)
    .limit(1)
  const defaultChannelId = channels?.[0]?.id
  if (!defaultChannelId)
    return

  // The two most recent versions deployed to that channel: current vs previous.
  const { data: history } = await supabase
    .from('deploy_history')
    .select('version_id')
    .eq('channel_id', defaultChannelId)
    .order('created_at', { ascending: false })
    .limit(2)
  if (!history || history.length < 2)
    return

  const currentId = history[0].version_id
  const previousId = history[1].version_id
  if (currentId === previousId)
    return

  // Filter out soft-deleted bundles so the banner stays consistent with the
  // dependency diff page, which refuses a deleted baseline in restoreCompareFromQuery().
  const { data: versions } = await supabase
    .from('app_versions')
    .select('id, name, native_packages')
    .eq('app_id', props.appId)
    .eq('deleted', false)
    .in('id', [currentId, previousId])

  const current = versions?.find(version => version.id === currentId)
  const previous = versions?.find(version => version.id === previousId)
  const currentPackages = toNativePackages(current?.native_packages)
  const previousPackages = toNativePackages(previous?.native_packages)
  if (!current || !previous || !currentPackages || !previousPackages)
    return

  const summary = summarizeCompatibility(comparePackages(currentPackages, previousPackages))
  if (summary.compatible)
    return

  // Drop the result if a newer check started while we were awaiting.
  if (requestToken !== latestRequestToken)
    return

  warning.value = {
    currentBundleId: currentId,
    currentBundleName: current.name,
    previousBundleId: previousId,
    previousBundleName: previous.name,
  }
}

function viewDependencies() {
  if (!warning.value)
    return
  router.push(`/app/${encodeURIComponent(props.appId)}/bundle/${warning.value.currentBundleId}/dependencies?compare=${warning.value.previousBundleId}`)
}

watch(() => [props.appId, props.reloadTrigger], () => {
  checkCompatibility()
}, { immediate: true })
</script>

<template>
  <div
    v-if="warning"
    class="mb-4 overflow-hidden border rounded-lg border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800"
  >
    <div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50">
          <IconTriangleAlert class="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p class="font-semibold text-amber-900 dark:text-amber-100">
            {{ t('compatibility-banner-title') }}
          </p>
          <p class="text-sm text-amber-700 dark:text-amber-300">
            {{ t('compatibility-banner-body', { current: warning.currentBundleName, previous: warning.previousBundleName }) }}
          </p>
        </div>
      </div>

      <button
        class="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors rounded-md bg-amber-600 hover:bg-amber-700 shrink-0"
        @click="viewDependencies"
      >
        {{ t('compatibility-banner-cta') }}
      </button>
    </div>
  </div>
</template>
