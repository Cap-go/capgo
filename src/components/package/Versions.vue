<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RefresherCustomEvent } from '@ionic/vue'
import type { Database } from '~/types/supabase.types'
import { useSupabase } from '~/services/supabase'
import IconPrevious from '~icons/heroicons/chevron-left'
import IconNext from '~icons/heroicons/chevron-right'

const props = defineProps<{
  appId: string
}>()

const emit = defineEmits(['reload'])
const versions = ref<(Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row'])[]>([])
const { t } = useI18n()
const isLoadingSub = ref(false)
const supabase = useSupabase()
const search = ref('')
const isLoading = ref(false)
const filtered = ref<(Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row'])[]>([])
const displayedVersions = ref<(Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row'])[]>([])
const currentPageNumber = ref(1)
const pageNumbers = ref<number[]>([1])

const enhenceVersionElems = async (dataVersions: Database['public']['Tables']['app_versions']['Row'][]) => {
  const { data: dataVersionsMeta } = await supabase
    .from('app_versions_meta')
    .select()
    .in('id', dataVersions.map(({ id }) => id))
  const newVersions = dataVersions.map(({ id, ...rest }) => {
    const version = dataVersionsMeta ? dataVersionsMeta.find(({ id: idMeta }) => idMeta === id) : { size: 0, checksum: '' }
    return { id, ...rest, ...version } as (Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row'])
  })
  return newVersions
}

const display = (pageNumber: number) => {
  // Display the devices between the two indexes
  const firstIndex = pageNumber * 8
  const lastIndex = firstIndex + 8

  displayedVersions.value = versions.value.slice(firstIndex, lastIndex)
  currentPageNumber.value = pageNumber
}

const loadData = async () => {
  try {
    const { data: dataVersions } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', props.appId)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    if (!dataVersions)
      return
    display(currentPageNumber.value)
    versions.value.push(...(await enhenceVersionElems(dataVersions)))
    const pages = Array.from(Array(Math.ceil(versions.value.length / 8)).keys())
    pageNumbers.value = pages.slice(1, pages.length)
  }
  catch (error) {
    console.error(error)
  }
}

const searchVersion = async () => {
  isLoadingSub.value = true
  const { data: dataVersions } = await supabase
    .from('app_versions')
    .select()
    .eq('app_id', props.appId)
    .eq('deleted', false)
    .order('created_at', { ascending: false })
    .like('name', `%${search.value}%`)
  if (!dataVersions) {
    filtered.value = []
    isLoadingSub.value = false
    return
  }
  filtered.value = await enhenceVersionElems(dataVersions)
  isLoadingSub.value = false
}

const versionFilter = computed(() => {
  if (search.value)
    return filtered.value
  return versions.value
})

const refreshData = async (evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    await loadData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  evt?.target?.complete()
}

watchEffect(async () => {
  await refreshData()
  display(currentPageNumber.value)
})
</script>

<template>
  <div id="versions" class="bg-white border md:mx-3 rounded-sm shadow-lg border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <header class="px-5 py-4 border-b border-slate-100">
      <h2 class="font-semibold text-slate-800 dark:text-white">
        {{ t('package.versions') }}
      </h2>
    </header>
    <div class="p-3">
      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="w-full table-auto" aria-label="Table with your apps">
          <!-- Table header -->
          <thead class="text-xs uppercase rounded-sm text-slate-400 dark:text-white bg-slate-50 dark:bg-gray-800">
            <tr>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('name') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('pckage.version.created-at') }}
                </div>
              </th>
              <th class="p-2" />
            </tr>
          </thead>
          <!-- Table body -->
          <tbody class="text-sm font-medium divide-y divide-slate-100">
            <!-- Row -->
            <VersionCard v-for="(version, i) in displayedVersions" :key="version.name + i" :version="version" @reload="emit('reload')" />
          </tbody>
        </table>
      </div>
    </div>
    <div class="py-6">
      <div class="px-4 mx-auto sm:px-6 lg:px-8">
        <nav class="relative flex justify-center -space-x-px rounded-md">
          <IconPrevious v-if="currentPageNumber > 1" class="dark:text-white text-gray-400 self-center text-lg cursor-pointer" @click="display(currentPageNumber - 1)" />
          <a v-if="currentPageNumber > 1" class="relative cursor-pointer text-gray-400 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white bg-white dark:bg-gray-800  inline-flex items-center justify-center px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9" @click="display(currentPageNumber - 1)"> {{ currentPageNumber - 1 }} </a>
          <a class="relative cursor-pointer text-lg text-gray-600 dark:text-white hover:text-gray-700 dark:hover:text-white bg-white dark:bg-gray-800  inline-flex items-center justify-center px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9"> {{ currentPageNumber }} </a>
          <a v-if="currentPageNumber < pageNumbers[pageNumbers.length - 1]" class="relative cursor-pointer text-gray-400 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white bg-white dark:bg-gray-800  inline-flex items-center justify-center px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 focus:z-10 w-9" @click="display(currentPageNumber + 1)"> {{ currentPageNumber + 1 }} </a>
          <IconNext v-if="currentPageNumber < pageNumbers[pageNumbers.length - 1]" class="dark:text-white text-gray-400 self-center text-lg cursor-pointer" @click="display(currentPageNumber + 1)" />
        </nav>
      </div>
    </div>
  </div>
</template>
