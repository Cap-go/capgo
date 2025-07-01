<script setup lang="ts">
import type { TableColumn } from './comp_def'
import { FormKit } from '@formkit/vue'
import { useDebounceFn } from '@vueuse/core'
import DOMPurify from 'dompurify'
import { useI18n } from 'petite-vue-i18n'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import IconTrash from '~icons/heroicons/trash'
import IconDown from '~icons/ic/round-keyboard-arrow-down'
import IconPrev from '~icons/ic/round-keyboard-arrow-left'
import IconNext from '~icons/ic/round-keyboard-arrow-right'
import IconFastBackward from '~icons/ic/round-keyboard-double-arrow-left'
import IconFastForward from '~icons/ic/round-keyboard-double-arrow-right'
import IconSearch from '~icons/ic/round-search?raw'
import plusOutline from '~icons/ion/add-outline'
import IconSortDown from '~icons/lucide/chevron-down'
import IconSortUp from '~icons/lucide/chevron-up'
import IconSort from '~icons/lucide/chevrons-up-down'
import IconFilter from '~icons/system-uicons/filtering'
import IconReload from '~icons/tabler/reload'

interface Props {
  isLoading?: boolean
  filterText?: string
  filters?: { [key: string]: boolean }
  searchPlaceholder?: string
  showAdd?: boolean
  search?: string
  total: number
  currentPage: number
  columns: TableColumn[]
  elementList: { [key: string]: any }[]
  massSelect?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits([
  'add',
  'reload',
  'reset',
  'next',
  'prev',
  'fastForward',
  'fastBackward',
  'update:search',
  'update:filters',
  'update:columns',
  'update:currentPage',
  'plusClick',
  'selectRow',
  'massDelete',
])
const { t } = useI18n()
const searchVal = ref(props.search ?? '')
// const sorts = ref<TableSort>({})
// get columns from elementList

const offset = computed(() => {
  if (!props.elementList)
    return 0
  return props.elementList.length
})

const selectedRows = ref<boolean[]>(props.elementList.map(_ => false))
const previousSelectedRow = ref<number | null>(null)

const filterList = computed(() => {
  if (!props.filters)
    return []
  return Object.keys(props.filters)
})
const filterActivated = computed(() => {
  if (!props.filters)
    return []
  return Object.keys(props.filters).reduce((acc, key) => {
    if (props.filters![key])
      acc += 1
    return acc
  }, 0)
})

function sortClick(key: number) {
  if (!props.columns[key].sortable)
    return
  let sortable = props.columns[key].sortable
  if (sortable === 'asc')
    sortable = 'desc'
  else if (sortable === 'desc')
    sortable = true
  else
    sortable = 'asc'
  const newColumns = [...props.columns]
  newColumns[key].sortable = sortable
  emit('update:columns', newColumns)
}

function updateUrlParams() {
  const params = new URLSearchParams(window.location.search)
  if (searchVal.value)
    params.set('search', searchVal.value)
  else
    params.delete('search')
  if (props.filters) {
    Object.entries(props.filters).forEach(([key, value]) => {
      if (value)
        params.append('filter', key)
      else
        params.delete('filter', key)
    })
  }
  if (props.currentPage)
    params.set('page', props.currentPage.toString())
  else
    params.delete('page')
  props.columns.forEach((col) => {
    if (col.sortable && col.sortable !== true)
      params.set(`sort_${col.key}`, col.sortable)
    else
      params.delete(`sort_${col.key}`)
  })
  const paramsString = params.toString() ? `?${params.toString()}` : ''
  window.history.pushState({}, '', `${window.location.pathname}${paramsString}`)
}

function loadFromUrlParams() {
  const params = new URLSearchParams(window.location.search)
  const searchParam = params.get('search')
  if (searchParam && searchParam !== searchVal.value) {
    searchVal.value = searchParam
    emit('update:search', searchVal.value)
  }
  const pageParam = params.get('page')
  if (pageParam && pageParam !== props.currentPage.toString()) {
    const page = Number.parseInt(pageParam, 10)
    if (!Number.isNaN(page) && page !== props.currentPage) {
      emit('update:currentPage', page)
    }
  }
  const filterParams = params.getAll('filter')
  if (props.filters && filterParams.length > 0) {
    const newFilters = { ...props.filters }
    Object.keys(newFilters).forEach((key) => {
      newFilters[key] = filterParams.includes(key)
    })
    if (JSON.stringify(newFilters) !== JSON.stringify(props.filters)) {
      console.log('update filters', newFilters, props.filters)
      emit('update:filters', newFilters)
    }
  }
  const newColumns = [...props.columns]
  props.columns.forEach((col) => {
    const sortParam = params.get(`sort_${col.key}`)
    if (sortParam && col.sortable && (sortParam === 'asc' || sortParam === 'desc')) {
      newColumns[props.columns.indexOf(col)].sortable = sortParam
    }
  })
  if (newColumns.length > 0) {
    emit('update:columns', newColumns)
  }
}

// Cleanup on unmount
onUnmounted(() => {
  const params = new URLSearchParams(window.location.search)
  // Remove our specific parameters
  params.delete('search')
  params.delete('page')
  params.delete('filter')
  props.columns.forEach((col) => {
    params.delete(`sort_${col.key}`)
  })
  const paramsString = params.toString() ? `?${params.toString()}` : ''
  window.history.pushState({}, '', `${window.location.pathname}${paramsString}`)
})

onMounted(() => {
  loadFromUrlParams()
})

const debouncedReload = useDebounceFn(() => {
  emit('reload')
}, 1000)

const debouncedUpdateUrlParams = useDebounceFn(() => {
  updateUrlParams()
}, 1000)

const debouncedSearch = useDebounceFn(() => {
  emit('update:search', searchVal.value)
}, 1000)

watch(() => props.columns, () => {
  debouncedUpdateUrlParams()
  debouncedReload()
}, { deep: true })

watch(() => props.filters, () => {
  debouncedUpdateUrlParams()
  debouncedReload()
}, { deep: true, immediate: true })

watch(searchVal, () => {
  debouncedSearch()
  debouncedUpdateUrlParams()
  debouncedReload()
})

watch(() => props.currentPage, () => {
  debouncedUpdateUrlParams()
  debouncedReload()
})

function displayValueKey(elem: any, col: TableColumn | undefined) {
  if (!col)
    return ''
  const text = col.displayFunction ? col.displayFunction(elem) : elem[col.key]
  if (col.sanitizeHtml)
    return DOMPurify.sanitize(text)
  return text
}
const displayElemRange = computed(() => {
  const begin = (props.currentPage - 1) * props.elementList.length
  const end = begin + props.elementList.length
  return `${begin}-${end}`
})

function canNext() {
  return props.currentPage < Math.ceil(props.total / offset.value)
}
function canPrev() {
  return props.currentPage > 1
}

async function next() {
  if (canNext()) {
    emit('next')
    emit('update:currentPage', props.currentPage + 1)
  }
}
async function fastForward() {
  if (canNext()) {
    emit('fastForward')
    emit('update:currentPage', Math.ceil(props.total / offset.value))
  }
}
async function prev() {
  if (canPrev()) {
    emit('prev')
    emit('update:currentPage', props.currentPage - 1)
  }
}
async function fastBackward() {
  if (canPrev()) {
    emit('fastBackward')
    emit('update:currentPage', 1)
  }
}
watch(props.elementList, () => {
  selectedRows.value = props.elementList.map(_ => false)
  previousSelectedRow.value = null
})
async function handleCheckboxClick(i: number, e: MouseEvent) {
  if (e.shiftKey && previousSelectedRow.value !== null) {
    for (let y = Math.min(previousSelectedRow.value, i); y <= Math.max(previousSelectedRow.value, i); y++) {
      if (i > previousSelectedRow.value && y === previousSelectedRow.value)
        continue

      selectedRows.value[y] = !selectedRows.value[y]
    }
    emit('selectRow', selectedRows.value)
  }
  else {
    selectedRows.value[i] = !selectedRows.value[i]
    emit('selectRow', selectedRows.value)
  }
  previousSelectedRow.value = i
}

function getSkeletonWidth(columnIndex?: number) {
  // Count visible columns (mobile-friendly columns on mobile, all on desktop)
  const visibleColumns = props.columns.filter(col => col.mobile !== false)
  const totalVisibleColumns = visibleColumns.length
  const hasMassSelect = props.massSelect

  if (columnIndex === undefined) {
    // Mass select column - tiny fixed width for checkbox
    return '60px'
  }

  // Data columns - distribute remaining width equally
  const remainingWidth = hasMassSelect ? `calc((100% - 60px) / ${totalVisibleColumns})` : `${100 / totalVisibleColumns}%`
  return remainingWidth
}
</script>

<template>
  <div class="pb-4 overflow-x-auto md:pb-0">
    <div class="flex items-start justify-between p-3 pb-4 md:items-center">
      <div class="flex">
        <button class="mr-2 inline-flex items-center border border-gray-300 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-white focus:outline-hidden focus:ring-4 focus:ring-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 cursor-pointer" type="button" @click="emit('reset')">
          <IconReload v-if="!isLoading" class="w-4 h-4 mr-0 md:mr-2" />
          <Spinner v-else size="w-4 h-4 mr-0 md:mr-2" />
          <span class="hidden text-sm md:block">{{ t('reload') }}</span>
        </button>
        <div v-if="showAdd" class="mr-2 p-px rounded-lg from-cyan-500 to-purple-500 bg-linear-to-r">
          <button class="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-500 dark:bg-gray-800 hover:bg-gray-100 dark:text-white focus:outline-hidden focus:ring-4 focus:ring-gray-200 dark:hover:bg-gray-700 dark:focus:ring-gray-700 cursor-pointer" type="button" @click="emit('add')">
            <plusOutline v-if="!isLoading" class="w-4 h-4 mr-0 md:mr-2" />
            <Spinner v-else size="w-4 h-4 mr-0 md:mr-2" />
            <span class="hidden text-sm md:block">{{ t('add-one') }}</span>
          </button>
        </div>
        <div v-if="filterText && filterList.length" class="dropdown">
          <button tabindex="0" class="mr-2 inline-flex items-center border border-gray-300 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-white focus:outline-hidden focus:ring-4 focus:ring-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 cursor-pointer">
            <div v-if="filterActivated" class="absolute inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-500 border-2 border-white rounded-full -right-2 -top-2 dark:border-gray-900">
              {{ filterActivated }}
            </div>
            <IconFilter class="w-4 h-4 mr-2" />
            <span class="hidden md:block">{{ t(filterText) }}</span>
            <IconDown class="hidden w-4 h-4 ml-2 md:block" />
          </button>
          <ul class="p-2 bg-white shadow dropdown-content menu dark:bg-base-200 rounded-box z-1 w-52">
            <li v-for="(f, i) in filterList" :key="i">
              <div class="flex items-center p-2 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-600">
                <input
                  :id="`filter-radio-example-${i}`"
                  :checked="filters?.[f]"
                  type="checkbox"
                  :name="`filter-radio-${i}`"
                  class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:ring-offset-gray-800 dark:focus:ring-blue-600 dark:focus:ring-offset-gray-800"
                  @change="emit('update:filters', { ...filters, [f]: !filters?.[f] })"
                >
                <label :for="`filter-radio-example-${i}`" class="w-full ml-2 text-sm font-medium text-gray-900 rounded-sm dark:text-gray-300 first-letter:uppercase">{{ t(f) }}</label>
              </div>
            </li>
          </ul>
        </div>
      </div>
      <button v-if="props.massSelect && selectedRows.find(val => val)" class="inline-flex items-center self-end px-3 py-2 ml-auto mr-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-white focus:outline-hidden focus:ring-4 focus:ring-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 cursor-pointer" type="button" @click="selectedRows = selectedRows.map(() => true); emit('selectRow', selectedRows)">
        <span class="text-sm">{{ t('select_all') }}</span>
      </button>
      <button v-if="props.massSelect && selectedRows.find(val => val)" class=" self-end mr-2 inline-flex items-center border border-gray-300 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-white focus:outline-hidden focus:ring-4 focus:ring-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 cursor-pointer" type="button" @click="emit('massDelete')">
        <IconTrash class="text-red-500 h-[24px]" />
      </button>
      <div class="flex md:w-auto overflow-hidden">
        <FormKit
          v-model="searchVal"
          :placeholder="searchPlaceholder"
          :prefix-icon="IconSearch" :disabled="isLoading"
          enterkeyhint="send"
          :classes="{
            outer: 'mb-0! md:w-96',
            inner: 'rounded-full! py-1.5!',
          }"
        />
      </div>
    </div>
    <div class="block">
      <table id="custom_table" class="w-full text-sm text-left text-gray-500 dark:text-gray-400 md:pb-0 pb-14">
        <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th v-if="props.massSelect" class="px-4 md:px-6" />
            <th v-for="(col, i) in columns" :key="i" scope="col" class="py-1 md:py-3 px-4 md:px-6" :class="{ 'cursor-pointer': col.sortable, 'hidden md:table-cell': !col.mobile }" @click="sortClick(i)">
              <div class="flex items-center first-letter:uppercase">
                {{ col.label }}
                <div v-if="col.sortable">
                  <IconSortUp v-if="col.sortable === 'asc'" />
                  <IconSortDown v-else-if="col.sortable === 'desc'" />
                  <IconSort v-else />
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody v-if="!isLoading && elementList.length !== 0">
          <tr
            v-for="(elem, i) in elementList" :key="i"
            class="bg-white border-b dark:border-gray-700 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            <template v-if="true">
              <th v-if="props.massSelect" class="px-4 md:px-6">
                <input
                  id="select-rows" :checked="selectedRows[i]" class="scale-checkbox" type="checkbox" @click="(e: MouseEvent) => { handleCheckboxClick(i, e) }"
                >
              </th>
              <template v-for="(col, _y) in columns" :key="`${i}_${_y}`">
                <th v-if="col.head" :class="`${col.class ?? ''}${!col.mobile ? ' hidden md:table-cell' : ''} ${col.onClick ? 'cursor-pointer hover:underline clickable-cell' : ''}`" scope="row" class="py-2 md:py-4 px-4 md:px-6 font-medium text-gray-900 whitespace-nowrap dark:text-white" @click.stop="col.onClick ? col.onClick(elem) : () => {}">
                  <div v-if="col.allowHtml" v-html="displayValueKey(elem, col)" />
                  <template v-else>
                    {{ displayValueKey(elem, col) }}
                  </template>
                </th>
                <td v-else-if="col.actions || col.icon" :class="`${col.class ?? ''} ${!col.mobile ? 'hidden md:table-cell' : ''}`" class="px-4 md:px-6 py-2 md:py-4">
                  <div class="flex items-center space-x-1">
                    <template v-if="col.actions">
                      <button
                        v-for="(action, actionIndex) in col.actions"
                        v-show="!action.visible || action.visible(elem)"
                        :key="actionIndex"
                        :disabled="action.disabled && action.disabled(elem)"
                        class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:disabled:hover:text-gray-400"
                        @click.stop="action.onClick(elem)"
                      >
                        <component :is="action.icon" />
                      </button>
                    </template>
                    <template v-else-if="col.icon">
                      <button
                        class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 rounded-md cursor-pointer"
                        @click.stop="col.onClick ? col.onClick(elem) : () => {}"
                        v-html="col.icon"
                      />
                    </template>
                  </div>
                </td>
                <td v-else :class="`${col.class ?? ''} ${!col.mobile ? 'hidden md:table-cell' : ''} ${col.onClick ? 'cursor-pointer hover:underline clickable-cell' : ''} overflow-hidden text-ellipsis whitespace-nowrap`" class="px-4 md:px-6 py-2 md:py-4" @click.stop="col.onClick ? col.onClick(elem) : () => {}">
                  <div v-if="col.allowHtml" v-html="displayValueKey(elem, col)" />
                  <template v-else>
                    {{ displayValueKey(elem, col) }}
                  </template>
                </td>
              </template>
            </template>
          </tr>
        </tbody>
        <tbody v-else-if="!isLoading && elementList.length === 0">
          <tr>
            <td :colspan="columns.length + (props.massSelect ? 1 : 0)" class="px-4 md:px-6 py-2 md:py-4 text-center text-gray-500 dark:text-gray-400">
              {{ t('no_elements_found') }}
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="i in 10" :key="i" :class="{ 'animate-pulse duration-1000': isLoading }">
            <td v-if="props.massSelect" class="px-4 md:px-6 py-2 md:py-4" :style="`width: ${getSkeletonWidth()}`">
              <div class="rounded-full bg-gray-200 dark:bg-gray-700 w-full mb-4 h-2.5" />
            </td>
            <td v-for="(col, y) in columns" :key="`${i}_${y}`" class="px-4 md:px-6 py-2 md:py-4" :class="{ 'hidden md:table-cell': !col.mobile }" :style="`width: ${getSkeletonWidth(y)}`">
              <div class="rounded-full bg-gray-200 dark:bg-gray-700 w-full" :class="{ 'mb-4 h-2.5': col.head, 'h-2 mb-2.5': !col.head }" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav class="fixed bottom-0 left-0 z-40 flex items-center justify-between w-full p-4 bg-white md:relative dark:bg-gray-900 md:bg-transparent md:pt-4 dark:md:bg-transparent" aria-label="Table navigation">
      <span class="text-sm font-normal text-gray-500 dark:text-gray-400"><span class="hidden md:inline-block">{{ t('showing') }}</span> <span class="font-semibold text-gray-900 dark:text-white">{{ displayElemRange }}</span> of <span class="font-semibold text-gray-900 dark:text-white">{{ total }}</span></span>
      <ul class="inline-flex items-center -space-x-px">
        <li>
          <button class="block px-3 py-2 ml-0 leading-tight text-gray-500 bg-white border border-gray-300 rounded-l-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 cursor-pointer" :class="{ 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white': canPrev() }" :disabled="!canPrev()" @click="fastBackward">
            <span class="sr-only">{{ t('fast-backward') }}</span>
            <IconFastBackward />
          </button>
        </li>
        <li>
          <button class="block px-3 py-2 ml-0 leading-tight text-gray-500 bg-white border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 cursor-pointer" :class="{ 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white': canPrev() }" :disabled="!canPrev()" @click="prev">
            <span class="sr-only">{{ t('previous') }}</span>
            <IconPrev />
          </button>
        </li>
        <li>
          <button aria-current="page" class="z-10 px-3 py-2 leading-tight text-blue-600 border border-blue-300 bg-blue-50 dark:border-gray-700 dark:bg-gray-700 dark:text-white" disabled>
            {{ currentPage }}
          </button>
        </li>
        <li>
          <button class="block px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 cursor-pointer" :class="{ 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white': canNext() }" :disabled="!canNext()" @click="next">
            <span class="sr-only">{{ t('next') }}</span>
            <IconNext />
          </button>
        </li>
        <li>
          <button class="block px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 rounded-r-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 cursor-pointer" :class="{ 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white': canNext() }" :disabled="!canNext()" @click="fastForward">
            <span class="sr-only"> {{ t('fast-forward') }} </span>
            <IconFastForward />
          </button>
        </li>
      </ul>
    </nav>
  </div>
</template>

<style scoped>
.scale-checkbox {
  transform: scale(1.5);
  transform-origin: center;
}
</style>
