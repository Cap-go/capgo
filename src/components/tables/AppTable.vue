<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import IconTrash from '~icons/heroicons/trash?raw'
import { useDisplayStore } from '~/stores/display'

interface Channel {
  version: {
    name: string
    created_at: string
  }
}
const element: Database['public']['Tables']['channels']['Row'] & Channel = {} as any

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const offset = 10
const { t } = useI18n()
const displayStore = useDisplayStore()
const supabase = useSupabase()
const router = useRouter()
const total = ref(0)
const search = ref('')
const elements = ref<(typeof element)[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref()
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})
const didCancel = async (name: string) => {
  displayStore.dialogOption = {
    header: t('alert-confirm-delete'),
    message: `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-delete'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

const getData = async () => {
  isLoading.value = true
  try {
    const req = supabase
      .from('apps')
      .select(`
          id,
          name,
          app_id,
          public,
          version (
            name,
            created_at
          ),
          created_at,
          updated_at
          `, { count: 'exact' })
      .range(currentVersionsNumber.value, currentVersionsNumber.value + offset - 1)

    if (search.value)
      req.like('name', `%${search.value}%`)

    if (columns.value.length) {
      columns.value.forEach((col) => {
        if (col.sortable && typeof col.sortable === 'string')
          req.order(col.key as any, { ascending: col.sortable === 'asc' })
      })
    }
    const { data: dataVersions, count } = await req
    if (!dataVersions)
      return
    elements.value.push(...dataVersions as any)
    // console.log('count', count)
    total.value = count || 0
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}
const refreshData = async () => {
  console.log('refreshData')
  try {
    currentPage.value = 1
    elements.value.length = 0
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}
const deleteOne = async (one: typeof element) => {
  // console.log('deleteBundle', bundle)
  if (await didCancel(t('channel')))
    return
  try {
    const { error: delChanError } = await supabase
      .from('channels')
      .delete()
      .eq('app_id', one.id)
    if (delChanError) {
      displayStore.messageToast.push(t('cannot-delete-channel'))
    }
    else {
      await refreshData()
      displayStore.messageToast.push(t('channel-deleted'))
    }
  }
  catch (error) {
    displayStore.messageToast.push(t('cannot-delete-channel'))
  }
}

columns.value = [
  {
    label: t('name'),
    key: 'name',
    mobile: 'title',
    sortable: true,
    head: true,
  },
  {
    label: t('last-upload'),
    key: 'updated_at',
    mobile: 'header',
    sortable: 'desc',
    displayFunction: (elem: typeof element) => formatDate(elem.updated_at || ''),
  },
  {
    label: t('last-version'),
    key: 'created_at',
    mobile: 'footer',
    sortable: 'desc',
    displayFunction: (elem: typeof element) => elem.version.name,
  },
  {
    label: t('action'),
    key: 'action',
    mobile: 'after',
    icon: IconTrash,
    class: 'text-red-500',
    onClick: deleteOne,
  },
]

const reload = async () => {
  console.log('reload')
  try {
    elements.value.length = 0
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}

const openOne = async (one: typeof element) => {
  router.push(`/app/p/${one.id}`)
}
onMounted(async () => {
  await refreshData()
})
</script>

<template>
  <Table
    v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
    :total="total" row-click :element-list="elements"
    filter-text="Filters"
    :is-loading="isLoading"
    :search-placeholder="t('search-by-name')"
    @reload="reload()" @reset="refreshData()"
    @row-click="openOne"
  />
</template>
