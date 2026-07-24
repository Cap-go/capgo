<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AdminStatsCard from '~/components/admin/AdminStatsCard.vue'
import { formatLocalDateTime } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'

interface RunnerRow {
  id: number
  systemId: string | null
  online: boolean
  busy: boolean
  currentJobId: string | null
  lastPollAt: number | null
}

interface JobRow {
  jobId: string
  status: string
  createdAt: number
  startedAt: number | null
  error: string | null
}

interface BuilderRuntimeResponse {
  status?: string
  ok?: {
    status?: string
    machines_set?: number
    machines_answering?: number
    provider_enabled?: boolean
    updated_at?: number
  }
  runners?: {
    enabled?: boolean
    runnerStaleMs?: number
    runners?: RunnerRow[]
    jobs?: JobRow[]
    heal?: {
      lastResult?: string | null
      lastError?: string | null
      lastHealAt?: number | null
      offlineSince?: number | null
    }
    scale?: {
      lastResult?: string | null
      lastError?: string | null
      requestedAt?: number | null
      lastScaleAt?: number | null
      lastScaleDay?: string | null
      lastAgentDescription?: string | null
    }
    pressure?: {
      waitingJobs?: number
      onlineRunners?: number
      registeredRunners?: number
      oldestWaitMs?: number
    }
  }
  error?: string
  message?: string
}

const { t } = useI18n()

const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const data = ref<BuilderRuntimeResponse | null>(null)

const okStatus = computed(() => data.value?.ok?.status ?? '-')
const okColor = computed(() => {
  const status = data.value?.ok?.status
  if (status === 'ok')
    return 'text-emerald-500'
  if (status === 'degraded' || status === 'no_machines')
    return 'text-rose-500'
  return 'text-slate-500'
})

const runners = computed(() => data.value?.runners?.runners ?? [])
const jobs = computed(() => data.value?.runners?.jobs ?? [])
const pressure = computed(() => data.value?.runners?.pressure)
const heal = computed(() => data.value?.runners?.heal)
const scale = computed(() => data.value?.runners?.scale)

function formatEpoch(ms: number | null | undefined): string {
  if (!ms)
    return '-'
  return formatLocalDateTime(new Date(ms).toISOString())
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms))
    return '-'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60)
    return `${minutes}m`
  return `${Math.round(minutes / 60)}h ${minutes % 60}m`
}

async function loadStatus() {
  isLoading.value = true
  errorMessage.value = null
  try {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token)
      throw new Error('No active session available')

    const response = await fetch(`${defaultApiHost}/private/admin_builder_status`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })
    const payload = await response.json().catch(() => ({})) as BuilderRuntimeResponse
    if (!response.ok) {
      throw new Error(payload.message || payload.error || `HTTP ${response.status}`)
    }
    data.value = payload
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void loadStatus()
})

defineExpose({ refresh: loadStatus })
</script>

<template>
  <section class="space-y-4 rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/40">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-slate-800 dark:text-white">
          {{ t('admin-builder-runtime-status') }}
        </h2>
        <p class="text-sm text-slate-500 dark:text-slate-300">
          {{ t('admin-builder-runtime-status-help') }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <a
          class="d-btn d-btn-outline d-btn-sm"
          href="https://builder.capgo.app/"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('admin-builder-open-legacy') }}
        </a>
        <button
          class="d-btn d-btn-primary d-btn-sm"
          type="button"
          :disabled="isLoading"
          @click="loadStatus"
        >
          {{ isLoading ? t('refreshing') : t('refresh') }}
        </button>
      </div>
    </div>

    <div
      v-if="errorMessage && !data"
      class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
    >
      {{ errorMessage }}
    </div>

    <div v-else-if="data" class="space-y-4">
      <div
        v-if="errorMessage"
        class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100"
      >
        {{ errorMessage }}
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatsCard
          :title="t('admin-builder-health')"
          :value="okStatus"
          :color-class="okColor"
          :subtitle="t('admin-builder-machines-answering', {
            answering: data.ok?.machines_answering ?? 0,
            set: data.ok?.machines_set ?? 0,
          })"
          :is-loading="isLoading"
        />
        <AdminStatsCard
          :title="t('admin-builder-waiting-jobs')"
          :value="pressure?.waitingJobs ?? 0"
          :subtitle="t('admin-builder-oldest-wait', { wait: formatDuration(pressure?.oldestWaitMs) })"
          color-class="text-amber-500"
          :is-loading="isLoading"
        />
        <AdminStatsCard
          :title="t('admin-builder-heal')"
          :value="heal?.lastResult || '-'"
          :subtitle="heal?.lastError || formatEpoch(heal?.lastHealAt)"
          color-class="text-sky-500"
          :is-loading="isLoading"
        />
        <AdminStatsCard
          :title="t('admin-builder-scale')"
          :value="scale?.lastResult || '-'"
          :subtitle="scale?.lastScaleDay
            ? t('admin-builder-last-scale-day', { day: scale.lastScaleDay })
            : (scale?.lastError || formatEpoch(scale?.requestedAt))"
          color-class="text-violet-500"
          :is-loading="isLoading"
        />
      </div>

      <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table class="table w-full text-sm">
          <thead>
            <tr class="text-left text-slate-500">
              <th>{{ t('id') }}</th>
              <th>{{ t('admin-builder-system') }}</th>
              <th>{{ t('admin-builder-connection') }}</th>
              <th>{{ t('admin-builder-work') }}</th>
              <th>{{ t('job') }}</th>
              <th>{{ t('admin-builder-last-poll') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="runners.length === 0">
              <td colspan="6" class="text-slate-500">
                {{ t('admin-builder-no-runners') }}
              </td>
            </tr>
            <tr v-for="runner in runners" :key="runner.id">
              <td>#{{ runner.id }}</td>
              <td>{{ runner.systemId || '-' }}</td>
              <td>
                <span :class="runner.online ? 'text-emerald-500' : 'text-rose-500'">
                  {{ runner.online ? t('online') : t('offline') }}
                </span>
              </td>
              <td>{{ runner.busy ? t('busy') : t('idle') }}</td>
              <td class="font-mono text-xs">
                {{ runner.currentJobId || '-' }}
              </td>
              <td>{{ formatEpoch(runner.lastPollAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table class="table w-full text-sm">
          <thead>
            <tr class="text-left text-slate-500">
              <th>{{ t('job') }}</th>
              <th>{{ t('status') }}</th>
              <th>{{ t('created') }}</th>
              <th>{{ t('started') }}</th>
              <th>{{ t('error') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="jobs.length === 0">
              <td colspan="5" class="text-slate-500">
                {{ t('admin-builder-no-jobs') }}
              </td>
            </tr>
            <tr v-for="job in jobs" :key="job.jobId">
              <td class="font-mono text-xs">
                {{ job.jobId }}
              </td>
              <td>{{ job.status }}</td>
              <td>{{ formatEpoch(job.createdAt) }}</td>
              <td>{{ formatEpoch(job.startedAt) }}</td>
              <td class="max-w-xs truncate text-rose-500">
                {{ job.error || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
