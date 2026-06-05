<script setup lang="ts">
import type { DefaultChannelCompatibilityResponse } from '~/services/bundleCompatibilityApi'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import IconAlertTriangle from '~icons/lucide/alert-triangle'
import IconArrowRight from '~icons/lucide/arrow-right'
import { getDefaultChannelCompatibility } from '~/services/bundleCompatibilityApi'

const props = withDefaults(defineProps<{
  appId: string
  refreshKey?: number
}>(), {
  refreshKey: 0,
})

const { t } = useI18n()
const router = useRouter()
const loading = ref(false)
const report = ref<DefaultChannelCompatibilityResponse | null>(null)
const requestId = ref(0)
let scheduledLoad: ReturnType<typeof setTimeout> | undefined

const showAlert = computed(() => report.value?.alert === true && report.value.candidate?.id && report.value.baseline?.id)
const candidateName = computed(() => report.value?.candidate?.name ?? t('unknown'))
const baselineName = computed(() => report.value?.baseline?.name ?? t('unknown'))
const channelName = computed(() => report.value?.channel?.name ?? t('unknown'))
const offendersPreview = computed(() => report.value?.summary.offenders.slice(0, 3).join(', ') ?? '')
const hiddenOffendersCount = computed(() => Math.max((report.value?.summary.offenders.length ?? 0) - 3, 0))

function clearScheduledLoad() {
  if (!scheduledLoad)
    return

  clearTimeout(scheduledLoad)
  scheduledLoad = undefined
}

async function loadCompatibilityAlert(appId: string, currentRequest: number) {
  if (!appId) {
    report.value = null
    loading.value = false
    return
  }

  try {
    loading.value = true
    const result = await getDefaultChannelCompatibility(appId)
    if (currentRequest === requestId.value && appId === props.appId.trim())
      report.value = result
  }
  catch (error) {
    console.error('Failed to load default channel compatibility', error)
    if (currentRequest === requestId.value)
      report.value = null
  }
  finally {
    if (currentRequest === requestId.value)
      loading.value = false
  }
}

function scheduleCompatibilityAlert(clearCurrentReport = false) {
  clearScheduledLoad()
  const appId = props.appId.trim()
  const currentRequest = ++requestId.value
  loading.value = false

  if (clearCurrentReport)
    report.value = null

  if (!appId) {
    report.value = null
    return
  }

  scheduledLoad = setTimeout(() => {
    scheduledLoad = undefined
    void loadCompatibilityAlert(appId, currentRequest)
  }, 0)
}

function reviewDependencies() {
  const candidateId = report.value?.candidate?.id
  const baselineId = report.value?.baseline?.id
  if (!candidateId || !baselineId)
    return

  router.push(`/app/${encodeURIComponent(props.appId)}/bundle/${candidateId}/dependencies?compare=${baselineId}`)
}

watch([() => props.appId, () => props.refreshKey], ([appId], previousValue) => {
  const previousAppId = previousValue?.[0]
  scheduleCompatibilityAlert(appId !== previousAppId)
}, { immediate: true })

onBeforeUnmount(() => {
  clearScheduledLoad()
  requestId.value += 1
})
</script>

<template>
  <div
    v-if="showAlert"
    class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/80 dark:bg-red-950/40"
    role="alert"
    aria-live="polite"
  >
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex min-w-0 gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/60">
          <IconAlertTriangle class="h-5 w-5 text-red-700 dark:text-red-300" aria-hidden="true" />
        </div>

        <div class="min-w-0">
          <p class="text-sm font-semibold text-red-950 dark:text-red-100">
            {{ t('dashboard-compat-alert-title') }}
          </p>
          <p class="mt-1 text-sm leading-6 text-red-800 dark:text-red-200">
            {{ t('dashboard-compat-alert-description', { candidate: candidateName, baseline: baselineName, channel: channelName }) }}
          </p>
          <p v-if="offendersPreview" class="mt-2 text-xs leading-5 text-red-700 dark:text-red-300">
            {{ t('dashboard-compat-alert-packages', { count: report?.summary.incompatibleCount ?? 0, packages: offendersPreview }) }}
            <span v-if="hiddenOffendersCount > 0">
              {{ t('dashboard-compat-alert-more', { count: hiddenOffendersCount }) }}
            </span>
          </p>
        </div>
      </div>

      <button
        class="d-btn d-btn-sm min-h-11 shrink-0 border-red-700 bg-red-700 text-white hover:border-red-800 hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:border-red-500 dark:bg-red-500 dark:text-red-950 dark:hover:border-red-400 dark:hover:bg-red-400"
        :disabled="loading"
        @click="reviewDependencies"
      >
        {{ t('dashboard-compat-alert-action') }}
        <IconArrowRight class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
