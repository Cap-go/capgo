<script setup lang="ts">
import IconSettings from '~icons/heroicons/cog-8-tooth'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appIdToUrl } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'

const props = defineProps<{
  app: Database['public']['Tables']['apps']['Row']
  channel: string
  deleteButton: boolean
}>()
const organizationStore = useOrganizationStore()
const route = useRoute()
const router = useRouter()
const mauNb = ref(0)
const main = useMainStore()
const isLoading = ref(true)
const { t } = useI18n()

function openSettngs(app: Database['public']['Tables']['apps']['Row']) {
  router.push(`/app/p/${appIdToUrl(app.app_id)}/settings`)
}

async function loadData() {
  if (props.app.app_id)
    mauNb.value = main.getTotalMauByApp(props.app.app_id)
}

async function refreshData() {
  isLoading.value = true
  await loadData()
  isLoading.value = false
}

function openPackage(appId: string) {
  router.push(`/app/package/${appIdToUrl(appId)}`)
}

const acronym = computed(() => {
  const words = props.app.name?.split(' ') || []
  let res = props.app.name?.slice(0, 2) || 'AP'
  if (words?.length > 2)
    res = words[0][0] + words[1][0]
  else if (words?.length > 1)
    res = words[0][0] + words[1][0]
  return res.toUpperCase()
})

const perm = computed(() => {
  // console.log(props.app.name, organizationStore.getOrgByAppId(props.app.app_id))
  if (props.app.name) {
    // We should call organizationStore.awaitInitialLoad but that is hard as this is a computed value
    // This creates a potential race condition
    const org = organizationStore.getOrgByAppId(props.app.app_id)

    return org?.role ?? t('unknown')
  }
  else {
    return t('unknown')
  }
})

watchEffect(async () => {
  if (route.path.endsWith('/app/home'))
    await refreshData()
})
</script>

<template>
  <!-- Row -->
  <tr class="text-gray-500 cursor-pointer md:table-row dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700" @click="openPackage(app.app_id)">
    <td class="table-cell w-1/5 p-2 md:hidden">
      <img v-if="app.icon_url" :src="app.icon_url" :alt="`App icon ${app.name}`" class="mr-2 rounded shrink-0 sm:mr-3 mask mask-squircle" width="42" height="42">
      <div v-else class="p-2 mr-2 text-xl bg-gray-700 mask mask-squircle">
        <span class="font-medium text-gray-300">
          {{ acronym }}
        </span>
      </div>
    </td>
    <td class="w-1/4 p-2">
      <div class="flex flex-wrap items-center text-slate-800 dark:text-white">
        <img v-if="app.icon_url" :src="app.icon_url" :alt="`App icon ${app.name}`" class="hidden mr-2 rounded md:block shrink-0 sm:mr-3 mask mask-squircle" width="42" height="42">
        <div v-else class="p-2 mr-2 text-xl bg-gray-700 mask mask-squircle">
          <span class="font-medium text-gray-300">
            {{ acronym }}
          </span>
        </div>
        <div class="max-w-max">
          {{ props.app.name }}
        </div>
      </div>
    </td>
    <td class="w-1/5 p-2">
      <div class="text-center">
        {{ props.app.last_version }}
      </div>
    </td>
    <td class="hidden w-1/5 p-2 md:table-cell">
      <div class="text-center">
        {{ formatDate(props.app.updated_at || "") }}
      </div>
    </td>
    <td class="hidden w-1/5 p-2 md:table-cell">
      <div v-if="!isLoading && !props.channel" class="text-center">
        {{ mauNb }}
      </div>
      <div v-else class="text-center">
        {{ props.channel }}
      </div>
    </td>
    <td class="hidden w-1/5 p-2 md:table-cell">
      <div class="text-center">
        {{ perm }}
      </div>
    </td>
    <td class="w-1/5 p-2">
      <button
        class="flex items-center p-3 mx-auto truncate rounded-lg hover:bg-gray-400 hover:text-white" @click.stop="openSettngs(app)"
      >
        <IconSettings class="text-lg" />
      </button>
    </td>
  </tr>
</template>
