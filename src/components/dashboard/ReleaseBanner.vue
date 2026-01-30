<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import IconCheckCircle from '~icons/lucide/check-circle'
import IconClock from '~icons/lucide/clock'
import IconPackage from '~icons/lucide/package'
import IconTrendingUp from '~icons/lucide/trending-up'
import { formatDistanceToNow } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  appId: string
}>()

const router = useRouter()
const { t } = useI18n()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()

const isLoading = ref(false)
const lastVersion = ref<string>('')
const lastReleaseDate = ref<string | null>(null)
const defaultChannelId = ref<number | null>(null)

const HOURS_48_IN_DAYS = 2

const status = computed(() => {
  if (isLoading.value)
    return 'loading'
  if (!lastReleaseDate.value)
    return 'empty'

  const releaseDate = new Date(lastReleaseDate.value)
  const now = new Date()
  const daysSinceRelease = (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24)

  if (daysSinceRelease <= HOURS_48_IN_DAYS)
    return 'recent'
  return 'old'
})

const statusTitle = computed(() => {
  switch (status.value) {
    case 'loading':
      return t('checking-releases')
    case 'empty':
      return t('no-releases-yet')
    case 'recent':
      return t('recent-releases-active')
    case 'old':
      return t('no-recent-releases')
    default:
      return ''
  }
})

const lastReleaseDisplay = computed(() => {
  if (!lastReleaseDate.value)
    return t('never')
  return formatDistanceToNow(new Date(lastReleaseDate.value))
})

const hasRecentRelease = computed(() => {
  if (!lastReleaseDate.value || isLoading.value)
    return false
  const releaseDate = new Date(lastReleaseDate.value)
  const now = new Date()
  const daysSinceRelease = (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24)
  return daysSinceRelease <= HOURS_48_IN_DAYS
})

async function fetchReleaseInfo() {
  if (!props.appId) {
    return
  }

  isLoading.value = true
  try {
    await organizationStore.awaitInitialLoad()
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      lastVersion.value = ''
      lastReleaseDate.value = null
      defaultChannelId.value = null
      return
    }

    const { data: versionsData } = await supabase
      .from('app_versions')
      .select('name, created_at')
      .eq('app_id', props.appId)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(1)

    const { data: channelsData } = await supabase
      .from('channels')
      .select('id')
      .eq('app_id', props.appId)
      .eq('public', true)
      .limit(1)

    const latestVersion = versionsData?.[0]
    const defaultChannel = channelsData?.[0]

    if (latestVersion) {
      lastVersion.value = latestVersion.name
      lastReleaseDate.value = latestVersion.created_at
    }
    else {
      lastVersion.value = ''
      lastReleaseDate.value = null
    }

    defaultChannelId.value = defaultChannel?.id || null
  }
  catch (error) {
    console.error('Error fetching release info:', error)
  }
  finally {
    isLoading.value = false
  }
}

function viewStats() {
  if (defaultChannelId.value) {
    router.push(`/app/${props.appId}/channel/${defaultChannelId.value}/statistics`)
  }
  else {
    router.push(`/app/${props.appId}/channels`)
  }
}

watch(() => [props.appId, organizationStore.currentOrganization?.gid], () => {
  fetchReleaseInfo()
}, { immediate: true })
</script>

<template>
  <div
    v-if="hasRecentRelease"
    class="mb-4 overflow-hidden border border-emerald-200 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800"
  >
    <div class="flex items-center justify-between p-4">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50">
          <IconCheckCircle class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>

        <div class="flex items-center gap-4">
          <div>
            <p class="font-semibold text-emerald-900 dark:text-emerald-100">
              {{ t('new-release-available') }}
            </p>
            <p class="text-sm text-emerald-700 dark:text-emerald-300">
              {{ t('version') }} {{ lastVersion }} — {{ t('released') }} {{ lastReleaseDisplay }}
            </p>
          </div>
        </div>
      </div>

      <button
        v-if="defaultChannelId"
        class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors rounded-md bg-emerald-600 hover:bg-emerald-700 shrink-0"
        @click="viewStats"
      >
        <IconTrendingUp class="w-4 h-4" />
        {{ t('view-adoption') }}
      </button>
    </div>
  </div>
</template>
