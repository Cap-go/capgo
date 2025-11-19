<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  appId: string
}>()

const emit = defineEmits<{
  'update:showingSteps': [value: boolean]
}>()

type BuildRequest = Database['public']['Tables']['build_requests']['Row']
type Element = BuildRequest

const { t } = useI18n()
const supabase = useSupabase()
const isMobile = Capacitor.isNativePlatform()
const offset = 20
const search = ref('')
const showSteps = ref(false)
const autoShowSteps = ref(false)
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const elements = ref<Element[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const total = ref(0)
const totalAllBuilds = ref<number | null>(null)
const organizationStore = useOrganizationStore()

const currentBuildsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})

function closeSteps() {
  autoShowSteps.value = false
  showSteps.value = false
}

function addOne() {
  autoShowSteps.value = false
  showSteps.value = true
}

function onboardingDone() {
  closeSteps()
  reload()
}

function applyAutoOnboardingState() {
  if ((totalAllBuilds.value ?? 0) === 0 && !autoShowSteps.value) {
    autoShowSteps.value = true
    showSteps.value = true
  }
}

async function updateOverallBuildsCount(): Promise<void> {
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId || !props.appId)
    return
  const { count, error } = await supabase
    .from('build_requests')
    .select('id', { count: 'exact', head: true })
    .eq('owner_org', orgId)
    .eq('app_id', props.appId)

  if (!error)
    totalAllBuilds.value = count
}

async function getData() {
  isLoading.value = true
  try {
    let query = supabase
      .from('build_requests')
      .select('*', { count: 'exact' })
      .eq('app_id', props.appId)
      .order('created_at', { ascending: false })
      .range(currentBuildsNumber.value, currentBuildsNumber.value + offset - 1)

    if (search.value) {
      query = query.or(`platform.ilike.%${search.value}%,status.ilike.%${search.value}%,builder_job_id.ilike.%${search.value}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching build requests:', error)
      return
    }

    elements.value = data || []
    total.value = count || 0
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

async function reload() {
  currentPage.value = 1
  elements.value.length = 0
  try {
    await Promise.all([getData(), updateOverallBuildsCount()])
    applyAutoOnboardingState()
  }
  catch (error) {
    console.error(error)
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
    case 'succeeded':
      return 'text-green-600 dark:text-green-400'
    case 'failed':
      return 'text-red-600 dark:text-red-400'
    case 'running':
    case 'in_progress':
      return 'text-blue-600 dark:text-blue-400'
    case 'pending':
      return 'text-yellow-600 dark:text-yellow-400'
    default:
      return 'text-gray-600 dark:text-gray-400'
  }
}

function getPlatformBadgeColor(platform: string): string {
  switch (platform) {
    case 'ios':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'android':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'both':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
}

columns.value = [
  {
    label: t('created-at'),
    key: 'created_at',
    mobile: true,
    class: 'truncate max-w-32',
    sortable: 'desc',
    displayFunction: (elem: Element) => formatDate(elem.created_at ?? ''),
  },
  {
    label: t('platform'),
    key: 'platform',
    mobile: true,
    class: 'truncate max-w-24',
    displayFunction: (elem: Element) => elem.platform,
  },
  {
    label: t('status'),
    key: 'status',
    mobile: true,
    class: 'truncate max-w-24',
    displayFunction: (elem: Element) => elem.status,
  },
  {
    label: t('build-mode'),
    key: 'build_mode',
    class: 'truncate max-w-24',
    displayFunction: (elem: Element) => elem.build_mode || '-',
  },
  {
    label: t('job-id'),
    key: 'builder_job_id',
    class: 'truncate max-w-32 font-mono text-xs',
    displayFunction: (elem: Element) => elem.builder_job_id?.substring(0, 8) || '-',
  },
  {
    label: t('updated-at'),
    key: 'updated_at',
    class: 'truncate max-w-32',
    displayFunction: (elem: Element) => formatDate(elem.updated_at ?? ''),
  },
]

watch(search, () => {
  reload()
})

watch(currentPage, () => {
  getData()
})

watch(showSteps, (newValue) => {
  emit('update:showingSteps', newValue)
})

onMounted(async () => {
  await reload()
})
</script>

<template>
  <div>
    <div v-if="!showSteps" class="flex flex-col overflow-hidden overflow-y-auto bg-white border border-slate-300 shadow-lg md:rounded-lg dark:border-slate-900 dark:bg-gray-800">
      <Table
        v-model:search="search"
        v-model:current-page="currentPage"
        :columns="columns"
        :element-list="elements"
        :is-loading="isLoading"
        :search-function="(e: Element, s: string) => e.platform.toLowerCase().includes(s.toLowerCase()) || e.status.toLowerCase().includes(s.toLowerCase())"
        :search-placeholder="t('search-builds')"
        :show-add="!isMobile"
        :total="total"
        :offset="offset"
        @add="addOne()"
        @reload="reload()"
      >
        <template #platform="{ element }">
          <span
            class="px-2 py-1 text-xs font-semibold rounded-full"
            :class="getPlatformBadgeColor(element.platform)"
          >
            {{ element.platform }}
          </span>
        </template>
        <template #status="{ element }">
          <span
            class="font-semibold"
            :class="getStatusColor(element.status)"
          >
            {{ element.status }}
          </span>
        </template>
        <template #empty>
          <div class="flex flex-col items-center justify-center p-8">
            <div class="text-gray-400 dark:text-gray-600 mb-4">
              <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {{ t('no-builds-yet') }}
            </h3>
            <p class="text-gray-600 dark:text-gray-400 text-center max-w-md">
              {{ t('no-builds-description') }}
            </p>
          </div>
        </template>
      </Table>
    </div>

    <StepsBuild v-else :onboarding="(totalAllBuilds ?? 0) === 0" :app-id="props.appId" @done="onboardingDone" @close-step="closeSteps()" />
  </div>
</template>
