<!-- eslint-disable @typescript-eslint/no-use-before-define -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { Database } from '~/types/supabase.types'
import { useSupabase } from '~/services/supabase'
import IconTrash from '~icons/heroicons/trash?raw'
import { bytesToMbText } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()
const router = useRouter()
const versions = ref<(Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row'])[]>([])
const { t } = useI18n()
const supabase = useSupabase()
const search = ref('')
const total = ref(0)
const route = useRoute()
const isLoading = ref(false)
const currentPageNumber = ref(1)
const appId = ref('')
const filters = ref({
  external: false,
})
const offset = 10
const currentVersionsNumber = ref(0)

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

const didCancel = async (name: string) => {
  displayStore.dialogOption = {
    header: t('alert.confirm-delete'),
    message: `${t('alert.not-reverse-message')} ${t('alert.delete-message')} ${name}?`,
    buttons: [
      {
        text: t('button.cancel'),
        role: 'cancel',
      },
      {
        text: t('button.delete'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

const deleteBundle = async (bundle: Database['public']['Tables']['app_versions']['Row']) => {
  // console.log('deleteBundle', bundle)
  if (await didCancel(t('device.version')))
    return
  try {
    const { data: channelFound, error: errorChannel } = await supabase
      .from('channels')
      .select()
      .eq('app_id', bundle.app_id)
      .eq('version', bundle.id)
    if ((channelFound && channelFound.length) || errorChannel) {
      displayStore.messageToast.push(`${t('device.version')} ${bundle.app_id}@${bundle.name} ${t('pckage.version.is-used-in-channel')}`)
      return
    }
    const { data: deviceFound, error: errorDevice } = await supabase
      .from('devices_override')
      .select()
      .eq('app_id', bundle.app_id)
      .eq('version', bundle.id)
    if ((deviceFound && deviceFound.length) || errorDevice) {
      displayStore.messageToast.push(`${t('device.version')} ${bundle.app_id}@${bundle.name} ${t('package.version.is-used-in-device')}`)
      return
    }
    const { error: delError } = await supabase
      .storage
      .from('apps')
      .remove([`${bundle.user_id}/${bundle.app_id}/versions/${bundle.bucket_id}`])
    const { error: delAppError } = await supabase
      .from('app_versions')
      .update({ deleted: true })
      .eq('app_id', bundle.app_id)
      .eq('id', bundle.id)
    if (delAppError || delError) {
      displayStore.messageToast.push(t('package.cannot-delete-version'))
    }
    else {
      displayStore.messageToast.push(t('package.version-deleted'))
      await refreshData()
    }
  }
  catch (error) {
    displayStore.messageToast.push(t('package.cannot-delete-version'))
  }
}

const columns = ref([
  {
    label: 'Name',
    key: 'name',
    mobile: 'title',
    sortable: true,
    head: true,
  },
  {
    label: 'Created at',
    key: 'created_at',
    mobile: 'header',
    sortable: false,
    displayFunction: (elem: Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row']) => formatDate(elem.created_at || ''),
  },
  {
    label: 'Size',
    mobile: 'footer',
    key: 'size',
    sortable: false,
    displayFunction: (elem: Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row']) => {
      if (elem.size)
        return bytesToMbText(elem.size)
      else if (elem.external_url)
        return t('package.externally')
      else
        return t('package.size_not_found')
    },
  },
  {
    label: 'Action',
    mobile: 'after',
    icon: IconTrash,
    class: 'text-red-500',
    onClick: deleteBundle,
  },
])
const loadData = async () => {
  try {
    const req = supabase
      .from('app_versions')
      .select('*', { count: 'exact' })
      .eq('app_id', appId.value)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .range(currentVersionsNumber.value, currentVersionsNumber.value + offset - 1)

    if (search.value)
      req.like('name', `%${search.value}%`)

    // if (filters.value.external)
    //   req.eq('external_url', null)
    const { data: dataVersions, count } = await req

    if (!dataVersions)
      return
    versions.value.push(...(await enhenceVersionElems(dataVersions)))
    total.value = count || 0
    if (dataVersions.length === offset) {
      currentVersionsNumber.value += offset
      currentPageNumber.value = Math.ceil(currentVersionsNumber.value / offset)
    }
  }
  catch (error) {
    console.error(error)
  }
}

const onSearch = async (s: string) => {
  search.value = s
  currentVersionsNumber.value = 0
  await refreshData()
}
const prev = async () => {
  console.log('prev')
  if (currentPageNumber.value > 1) {
    currentVersionsNumber.value -= offset * 2
    versions.value.length = 0
    await loadData()
  }
}
const next = async () => {
  console.log('next')
  if (currentPageNumber.value < Math.ceil(total.value / offset)) {
    versions.value.length = 0
    await loadData()
  }
}
const fastForward = async () => {
  console.log('fastForward')
  if (currentPageNumber.value < Math.ceil(total.value / offset)) {
    currentVersionsNumber.value = total.value - offset
    versions.value.length = 0
    await loadData()
  }
}
const fastBackward = async () => {
  console.log('fastBackward')
  if (currentPageNumber.value > 1) {
    currentVersionsNumber.value = 0
    versions.value.length = 0
    await loadData()
  }
}
const refreshData = async () => {
  isLoading.value = true
  try {
    currentVersionsNumber.value = 0
    versions.value.length = 0
    await loadData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

const openBundle = (bundle: Database['public']['Tables']['app_versions']['Row']) => {
  console.log('openBundle', bundle)
  router.push(`/app/p/${appId.value.replace(/\./g, '--')}/bundle/${bundle.id}`)
}

onMounted(async () => {
  if (route.path.endsWith('/bundles')) {
    appId.value = route.params.p as string
    appId.value = appId.value.replace(/--/g, '.')
    await refreshData()
  }
})
</script>

<template>
  <TitleHead :title="t('package.versions')" color="warning" :default-back="`/app/package/${route.params.p}`" />
  <div class="h-full overflow-y-scroll md:py-4">
    <div id="versions" class="flex flex-col mx-auto overflow-y-scroll border rounded-lg shadow-lg md:mt-5 md:w-2/3 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
      <Table
        class="p-3" :total="total" :current-page="currentPageNumber" row-click

        :element-list="versions" :columns="columns" :filters="filters" filter-text="Filters"
        search-placeholder="Search Bundle" @search-input="onSearch" @reload="refreshData()"
        @prev="prev" @next="next" @fast-backward="fastBackward" @fast-forward="fastForward" @row-click="openBundle"
      />
    </div>
  </div>
</template>
