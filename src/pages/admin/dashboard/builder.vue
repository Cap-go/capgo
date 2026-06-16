<route lang="yaml">
meta:
  layout: admin
</route>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AdminBarChart from '~/components/admin/AdminBarChart.vue'
import AdminFilterBar from '~/components/admin/AdminFilterBar.vue'
import AdminMultiLineChart from '~/components/admin/AdminMultiLineChart.vue'
import AdminStatsCard from '~/components/admin/AdminStatsCard.vue'
import ChartCard from '~/components/dashboard/ChartCard.vue'
import Spinner from '~/components/Spinner.vue'
import { useAdminDashboardStore } from '~/stores/adminDashboard'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'

interface FunnelStep { key: string, label: string, reached: number, drop_pct: number, of_start_pct: number }
interface Tally { key: string, count: number }
interface ErrorGroup { fingerprint: string, title: string, count: number, is_new: boolean }
interface OrgRow {
  org_id: string
  org_name: string
  attempts: number
  completed: number
  succeeded: boolean
  used_ai: boolean
  builds: number
  builds_failed: number
  last_seen: number
}
interface JourneyRow {
  org_id: string
  org_name: string
  app_id: string
  platform: string
  outcome: 'completed' | 'quit'
  milestone: number
  milestone_label: string
  last_step: string
  used_ai: boolean
  started_at: number
  ended_at: number
  duration_ms: number
  steps: string[]
}
interface BuilderAnalytics {
  kpis: {
    onboarding_starts: number
    completions: number
    completion_rate: number
    builds_total: number
    builds_succeeded: number
    builds_failed: number
    build_success_rate: number
    ai_orgs: number
    journeys_used_ai: number
  }
  funnel: FunnelStep[]
  quit_steps: Tally[]
  builds_daily: { date: string, succeeded: number, failed: number }[]
  builds_truncated: boolean
  status_breakdown: Tally[]
  errors: { failed_builds: number, groups: ErrorGroup[], new_count: number, novelty_meaningful: boolean, onboarding_error_categories: Tally[] }
  orgs: OrgRow[]
  journeys: JourneyRow[]
  posthog_configured: boolean
  posthog_connected: boolean
}

const { t } = useI18n()
const displayStore = useDisplayStore()
const mainStore = useMainStore()
const adminStore = useAdminDashboardStore()
const router = useRouter()

const isLoading = ref(true)
const isLoadingData = ref(false)
const data = ref<BuilderAnalytics | null>(null)

async function loadData() {
  isLoadingData.value = true
  try {
    data.value = (await adminStore.fetchStats('builder_analytics')) || null
  }
  catch (error) {
    console.error('[Admin Builder] Error loading builder analytics:', error)
    data.value = null
  }
  finally {
    isLoadingData.value = false
  }
}

const kpis = computed(() => data.value?.kpis)
const round1 = (n: number | undefined) => Math.round((n ?? 0) * 10) / 10

const funnelLabels = computed(() => (data.value?.funnel ?? []).map(f => f.label))
const funnelValues = computed(() => (data.value?.funnel ?? []).map(f => f.reached))
const hasFunnel = computed(() => (data.value?.funnel ?? []).some(f => f.reached > 0))
const funnelStart = computed(() => data.value?.funnel?.[0]?.reached ?? 0)

const buildsSeries = computed(() => {
  const daily = data.value?.builds_daily ?? []
  if (!daily.length)
    return []
  return [
    { label: 'Succeeded', color: '#10b981', data: daily.map(d => ({ date: d.date, value: d.succeeded })) },
    { label: 'Failed', color: '#ef4444', data: daily.map(d => ({ date: d.date, value: d.failed })) },
  ]
})
const hasBuildsTrend = computed(() => buildsSeries.value.some(s => s.data.some(p => p.value > 0)))

const quitItems = computed(() => data.value?.quit_steps ?? [])
const errorGroups = computed(() => data.value?.errors?.groups ?? [])
const newErrorGroups = computed(() => errorGroups.value.filter(g => g.is_new))
const onbErrorCategories = computed(() => data.value?.errors?.onboarding_error_categories ?? [])
const orgs = computed(() => data.value?.orgs ?? [])
const journeyQuitOnly = ref(false)
const journeys = computed(() => data.value?.journeys ?? [])
const journeysShown = computed(() =>
  journeyQuitOnly.value ? journeys.value.filter(j => j.outcome === 'quit') : journeys.value,
)
function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60)
    return `${s}s`
  if (s < 3600)
    return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

// PostHog half can be unconfigured or unreachable; surface that instead of silently showing
// empty onboarding/AI numbers.
const posthogWarning = computed(() => {
  const d = data.value
  if (!d || d.posthog_connected)
    return ''
  return d.posthog_configured
    ? 'PostHog returned no data or was unreachable for this period — onboarding funnel & AI metrics may be incomplete.'
    : 'PostHog is not configured (POSTHOG_READ_KEY) — onboarding funnel & AI metrics are unavailable. Build metrics below come from the database.'
})

function humanStep(step: string): string {
  if (!step)
    return '-'
  return step.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function ago(ms: number): string {
  if (!ms)
    return '-'
  const sec = Math.floor((Date.now() - ms) / 1000)
  if (sec < 3600)
    return `${Math.max(1, Math.floor(sec / 60))}m ago`
  if (sec < 86400)
    return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

watch(() => adminStore.activeDateRange, () => loadData(), { deep: true })
watch(() => adminStore.refreshTrigger, () => loadData())

onMounted(async () => {
  if (!mainStore.isAdmin) {
    router.push('/dashboard')
    return
  }
  isLoading.value = true
  await loadData()
  isLoading.value = false
  displayStore.NavTitle = t('builder')
})

displayStore.NavTitle = t('builder')
displayStore.defaultBack = '/dashboard'
</script>

<template>
  <div>
    <div class="h-full pb-4 overflow-hidden">
      <div class="w-full h-full px-4 pt-2 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <AdminFilterBar />

        <div v-if="isLoading" class="flex items-center justify-center min-h-screen">
          <Spinner size="w-24 h-24" />
        </div>

        <div v-else class="space-y-6">
          <!-- PostHog availability warning -->
          <div
            v-if="posthogWarning"
            class="rounded-md border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
          >
            {{ posthogWarning }}
          </div>

          <!-- KPI cards -->
          <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <AdminStatsCard title="Onboarding starts" :value="kpis?.onboarding_starts ?? 0" color-class="text-primary" :is-loading="isLoadingData" subtitle="Journeys started" />
            <AdminStatsCard title="Completed" :value="kpis?.completions ?? 0" color-class="text-emerald-500" :is-loading="isLoadingData" :subtitle="`${round1(kpis?.completion_rate)}% completion`" />
            <AdminStatsCard title="Builds" :value="kpis?.builds_total ?? 0" color-class="text-[#119eff]" :is-loading="isLoadingData" :subtitle="`${round1(kpis?.build_success_rate)}% success`" />
            <AdminStatsCard title="Build failures" :value="kpis?.builds_failed ?? 0" color-class="text-red-500" :is-loading="isLoadingData" subtitle="Failed builds" />
            <AdminStatsCard title="AI orgs" :value="kpis?.ai_orgs ?? 0" color-class="text-purple-500" :is-loading="isLoadingData" subtitle="Orgs that used AI" />
            <AdminStatsCard title="Journeys w/ AI" :value="kpis?.journeys_used_ai ?? 0" color-class="text-purple-400" :is-loading="isLoadingData" subtitle="Onboarding used AI" />
          </div>

          <!-- New errors alert -->
          <ChartCard
            v-if="newErrorGroups.length"
            title="New build errors (last 3 days)"
            :is-loading="isLoadingData"
            :has-data="true"
          >
            <template #header>
              <div class="flex flex-col gap-1">
                <h2 class="text-2xl font-semibold leading-tight text-amber-500">
                  New build errors (last 3 days)
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Failure signatures first seen in the last 3 days within the selected range — possible new/regressed issue
                </p>
              </div>
            </template>
            <ul class="space-y-2 h-full overflow-y-auto">
              <li
                v-for="g in newErrorGroups"
                :key="g.fingerprint"
                class="flex items-start justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 dark:bg-amber-900/20"
              >
                <span class="min-w-0 break-words text-sm text-slate-700 dark:text-slate-200">{{ g.title }}</span>
                <span class="shrink-0 text-sm font-semibold text-amber-600 dark:text-amber-400">{{ g.count }}×</span>
              </li>
            </ul>
          </ChartCard>

          <!-- Onboarding funnel -->
          <ChartCard
            title="Onboarding funnel"
            :total="funnelStart"
            unit="journeys"
            :is-loading="isLoadingData"
            :has-data="hasFunnel"
            no-data-message="No onboarding journeys in this period (or PostHog not configured)"
          >
            <template #header>
              <div class="flex flex-col gap-1">
                <h2 class="text-2xl font-semibold leading-tight dark:text-white text-slate-600">
                  Onboarding funnel
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Furthest milestone reached per journey (builder onboarding wizard)
                </p>
              </div>
            </template>
            <AdminBarChart
              :labels="funnelLabels"
              :values="funnelValues"
              label="Journeys reached"
              value-mode="count"
              :total="funnelStart"
              :is-loading="isLoadingData"
            />
          </ChartCard>

          <!-- Build outcomes over time -->
          <ChartCard
            title="Build outcomes over time"
            :is-loading="isLoadingData"
            :has-data="hasBuildsTrend"
            no-data-message="No builds in this period"
          >
            <template #header>
              <div class="flex flex-col gap-1">
                <h2 class="text-2xl font-semibold leading-tight dark:text-white text-slate-600">
                  Build outcomes over time
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Succeeded vs failed native builds per day (Supabase build_requests)
                  <span v-if="data?.builds_truncated" class="text-amber-500"> · results truncated at 100k rows; narrow the date range</span>
                </p>
              </div>
            </template>
            <AdminMultiLineChart :series="buildsSeries" :is-loading="isLoadingData" />
          </ChartCard>

          <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <!-- Where users drop off -->
            <ChartCard
              title="Where users drop off"
              :is-loading="isLoadingData"
              :has-data="quitItems.length > 0"
              no-data-message="No abandoned journeys in this period"
            >
              <template #header>
                <h2 class="text-2xl font-semibold leading-tight dark:text-white text-slate-600">
                  Where users drop off
                </h2>
              </template>
              <div class="space-y-2 h-full overflow-y-auto">
                <div v-for="q in quitItems" :key="q.key" class="flex items-center justify-between gap-3 text-sm">
                  <span class="min-w-0 truncate text-slate-700 dark:text-slate-200">{{ humanStep(q.key) }}</span>
                  <span class="shrink-0 font-semibold text-slate-500 dark:text-slate-400">{{ q.count }}</span>
                </div>
              </div>
            </ChartCard>

            <!-- Onboarding error categories -->
            <ChartCard
              title="Onboarding error categories"
              :is-loading="isLoadingData"
              :has-data="onbErrorCategories.length > 0"
              no-data-message="No onboarding errors in this period"
            >
              <template #header>
                <h2 class="text-2xl font-semibold leading-tight dark:text-white text-slate-600">
                  Onboarding error categories
                </h2>
              </template>
              <div class="space-y-2 h-full overflow-y-auto">
                <div v-for="e in onbErrorCategories" :key="e.key" class="flex items-center justify-between gap-3 text-sm">
                  <span class="min-w-0 truncate text-slate-700 dark:text-slate-200">{{ humanStep(e.key) }}</span>
                  <span class="shrink-0 font-semibold text-slate-500 dark:text-slate-400">{{ e.count }}</span>
                </div>
              </div>
            </ChartCard>
          </div>

          <!-- Build failure signatures -->
          <ChartCard
            title="Build failure signatures"
            :is-loading="isLoadingData"
            :has-data="errorGroups.length > 0"
            no-data-message="No failed builds in this period"
          >
            <template #header>
              <h2 class="text-2xl font-semibold leading-tight dark:text-white text-slate-600">
                Build failure signatures
              </h2>
            </template>
            <div class="h-full overflow-auto">
              <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th class="px-4 py-3">
                      Error
                    </th>
                    <th class="px-4 py-3 text-right">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr v-for="g in errorGroups" :key="g.fingerprint">
                    <td class="px-4 py-3">
                      <span class="break-words text-slate-700 dark:text-slate-200">{{ g.title }}</span>
                      <span v-if="g.is_new" class="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">NEW</span>
                    </td>
                    <td class="px-4 py-3 text-right font-semibold text-red-500">
                      {{ g.count }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ChartCard>

          <!-- Orgs -->
          <ChartCard
            title="Organizations"
            :is-loading="isLoadingData"
            :has-data="orgs.length > 0"
            no-data-message="No orgs onboarded in this period"
          >
            <template #header>
              <div class="flex flex-col gap-1">
                <h2 class="text-2xl font-semibold leading-tight dark:text-white text-slate-600">
                  Organizations
                </h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ orgs.length }} orgs that started builder onboarding or ran builds in this period — scroll for more
                </p>
              </div>
            </template>
            <div class="h-full overflow-auto">
              <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th class="px-4 py-3">
                      Org
                    </th>
                    <th class="px-4 py-3 text-right">
                      Attempts
                    </th>
                    <th class="px-4 py-3 text-right">
                      Builds
                    </th>
                    <th class="px-4 py-3 text-right">
                      Failed
                    </th>
                    <th class="px-4 py-3 text-right">
                      Last seen
                    </th>
                    <th class="px-4 py-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr v-for="o in orgs" :key="o.org_id">
                    <td class="px-4 py-3">
                      <span class="font-medium text-slate-900 dark:text-white">{{ o.org_name }}</span>
                      <span v-if="o.used_ai" class="ml-1.5 text-[10px] text-purple-500">AI</span>
                    </td>
                    <td class="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                      {{ o.completed }}/{{ o.attempts }}
                    </td>
                    <td class="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                      {{ o.builds }}
                    </td>
                    <td class="px-4 py-3 text-right" :class="o.builds_failed ? 'text-red-500' : 'text-slate-400'">
                      {{ o.builds_failed }}
                    </td>
                    <td class="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                      {{ ago(o.last_seen) }}
                    </td>
                    <td class="px-4 py-3">
                      <span
                        class="rounded px-2 py-0.5 text-xs font-medium"
                        :class="o.succeeded ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'"
                      >
                        {{ o.succeeded ? 'Succeeded' : 'In progress / quit' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ChartCard>

          <!-- Onboarding journeys -->
          <ChartCard
            title="Onboarding journeys"
            :is-loading="isLoadingData"
            :has-data="journeys.length > 0"
            no-data-message="No onboarding journeys in this period (or PostHog not configured)"
          >
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-col gap-1">
                  <h2 class="text-2xl font-semibold leading-tight dark:text-white text-slate-600">
                    Onboarding journeys
                  </h2>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    {{ journeysShown.length }} of {{ journeys.length }} journeys — who started, how far they got, and where they dropped
                  </p>
                </div>
                <label class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <input v-model="journeyQuitOnly" type="checkbox" class="rounded"> Quit only
                </label>
              </div>
            </template>
            <div class="h-full overflow-auto">
              <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th class="px-3 py-3">Org</th>
                    <th class="px-3 py-3">App</th>
                    <th class="px-3 py-3">Platform</th>
                    <th class="px-3 py-3">Furthest</th>
                    <th class="px-3 py-3">Last step (where)</th>
                    <th class="px-3 py-3">Outcome</th>
                    <th class="px-3 py-3 text-right">Duration</th>
                    <th class="px-3 py-3 text-right">Started</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr v-for="(j, i) in journeysShown" :key="`${j.org_id}-${j.app_id}-${j.started_at}-${i}`">
                    <td class="px-3 py-3">
                      <span class="font-medium text-slate-900 dark:text-white">{{ j.org_name }}</span>
                      <span v-if="j.used_ai" class="ml-1.5 text-[10px] text-purple-500">AI</span>
                    </td>
                    <td class="px-3 py-3 text-slate-500 dark:text-slate-400">{{ j.app_id }}</td>
                    <td class="px-3 py-3 capitalize text-slate-500 dark:text-slate-400">{{ j.platform }}</td>
                    <td class="px-3 py-3 text-slate-700 dark:text-slate-200">{{ j.milestone_label }}</td>
                    <td class="px-3 py-3 text-slate-700 dark:text-slate-200">{{ humanStep(j.last_step) }}</td>
                    <td class="px-3 py-3">
                      <span
                        class="rounded px-2 py-0.5 text-xs font-medium"
                        :class="j.outcome === 'completed' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'"
                      >
                        {{ j.outcome === 'completed' ? 'Completed' : 'Quit' }}
                      </span>
                    </td>
                    <td class="px-3 py-3 text-right text-slate-500 dark:text-slate-400">{{ fmtDuration(j.duration_ms) }}</td>
                    <td class="px-3 py-3 text-right text-slate-500 dark:text-slate-400">{{ ago(j.started_at) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  </div>
</template>
