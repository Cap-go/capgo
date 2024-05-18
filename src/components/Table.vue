<script setup lang="ts">
import debounce from 'lodash.debounce'
import { computed, onMounted, ref, watch } from 'vue'
import { initDropdowns } from 'flowbite'
import {
  kList,
  kListItem,
} from 'konsta/vue'
import { useI18n } from 'vue-i18n'
import VueDatePicker from '@vuepic/vue-datepicker'
import dayjs from 'dayjs'
import type { MobileColType, TableColumn } from './comp_def'
import type { Organization } from '~/stores/organization'
import IconNext from '~icons/ic/round-keyboard-arrow-right'
import IconSort from '~icons/lucide/chevrons-up-down'
import IconSortUp from '~icons/lucide/chevron-up'
import IconSortDown from '~icons/lucide/chevron-down'
import IconReload from '~icons/tabler/reload'
import IconFastForward from '~icons/ic/round-keyboard-double-arrow-right'
import IconPrev from '~icons/ic/round-keyboard-arrow-left'
import IconFastBackward from '~icons/ic/round-keyboard-double-arrow-left'
import IconClock from '~icons/heroicons/clock'
import IconCalendar from '~icons/heroicons/calendar'

interface Props {
  rowClick?: boolean
  isLoading?: boolean
  filterText?: string
  filters?: { [key: string]: boolean }
  searchPlaceholder?: string
  search?: string
  total: number
  currentPage: number
  columns: TableColumn[]
  elementList: { [key: string]: any }[]
  appId: string
}

const props = defineProps<Props>()
const emit = defineEmits([
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
  'filterClick',
  'rowClick',
  'sortClick',
  'rangeChange',
])
const { t } = useI18n()
const searchVal = ref(props.search || '')
const currentSelected = ref<'general' | 'precise'>('general')
const showTimeDropdown = ref(false)
const currentGeneralTime = ref<1 | 3 | 24>(1)
const preciseDates = ref<[Date, Date]>()
const thisOrganization = ref<Organization | null>(null)
const organizationStore = useOrganizationStore()

const startTime = computed(() => {
  const subStart = thisOrganization.value?.subscription_start
  if (!subStart)
    return [{ hours: 0, minutes: 0 }, { hours: 0, minutes: 0 }]

  const datePast = dayjs(subStart)
  const dateNow = dayjs()

  return [
    {
      hours: datePast.hour(),
      minutes: datePast.minute(),
    },
    {
      hours: dateNow.hour(),
      minutes: dateNow.minute(),
    },
  ]
})

// const sorts = ref<TableSort>({})
// get columns from elementList

const offset = computed(() => {
  if (!props.elementList)
    return 0
  return props.elementList.length
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

watch(props.columns, () => {
  emit('reload')
})
if (props.filters) {
  watch(props.filters, () => {
    emit('reload')
  })
}

watch(preciseDates, () => {
  console.log('preciseDates', preciseDates.value)
  emit('rangeChange', preciseDates.value)
})

watch(searchVal, debounce(() => {
  emit('update:search', searchVal.value)
  emit('reload')
}, 500))

function displayValueKey(elem: any, col: TableColumn | undefined) {
  if (!col)
    return ''
  return col.displayFunction ? col.displayFunction(elem) : elem[col.key]
}
const displayElemRange = computed(() => {
  const begin = (props.currentPage - 1) * props.elementList.length
  const end = begin + props.elementList.length
  return `${begin}-${end}`
})

function findMobileCol(name: MobileColType) {
  return props.columns ? props.columns.find(col => col.mobile === name) : undefined
}

function canNext() {
  return props.currentPage < Math.ceil(props.total / offset.value)
}
function canPrev() {
  return props.currentPage > 1
}

async function next() {
  console.log('next')
  if (canNext()) {
    emit('next')
    emit('update:currentPage', props.currentPage + 1)
    emit('reload')
  }
}
async function fastForward() {
  console.log('fastForward')
  if (canNext()) {
    emit('fastForward')
    emit('update:currentPage', Math.ceil(props.total / offset.value))
    emit('reload')
  }
}
async function prev() {
  console.log('prev')
  if (canPrev()) {
    emit('prev')
    emit('update:currentPage', props.currentPage - 1)
    emit('reload')
  }
}
async function fastBackward() {
  console.log('fastBackward')
  if (canPrev()) {
    emit('fastBackward')
    emit('update:currentPage', 1)
    emit('reload')
  }
}

async function clickLeft() {
  currentSelected.value = 'general'
  showTimeDropdown.value = !showTimeDropdown.value
}

async function clickRight() {
  currentSelected.value = 'precise'
}

async function setTime(time: 1 | 3 | 24) {
  currentGeneralTime.value = time
  if (time === 1) {
    preciseDates.value = [
      dayjs().subtract(1, 'hour').toDate(),
      new Date(),
    ]
  }
  else if (time === 3) {
    preciseDates.value = [
      dayjs().subtract(3, 'hour').toDate(),
      new Date(),
    ]
  }
  else {
    preciseDates.value = [
      dayjs().subtract(1, 'day').toDate(),
      new Date(),
    ]
  }
  // TODO: Closing is done in clickLeft
}

onMounted(async () => {
  initDropdowns()
  await organizationStore.awaitInitialLoad()
  thisOrganization.value = organizationStore.getOrgByAppId(props.appId) ?? null

  if (!thisOrganization.value)
    console.error('Invalid app??')
})
</script>

<template>
  <div class="relative pb-4 overflow-x-auto md:pb-0">
    <div class="flex items-start justify-between pb-4 md:items-center">
      <div class="flex h-10 mb-2 md:mb-0">
        <button class="relative mr-2 inline-flex items-center border border-gray-300 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-white focus:outline-none focus:ring-4 focus:ring-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700" type="button" @click="emit('reset')">
          <IconReload v-if="!isLoading" class="m-1 mr-2" />
          <Spinner v-else size="w-[16.8px] h-[16.8px] m-1 mr-2" />
          <span class="hidden text-sm md:block">{{ t('reload') }}</span>
        </button>
      </div>
      <!-- </div> -->
      <div class="flex h-10 ml-4 mr-auto text-sm font-medium text-gray-500 border divide-gray-300 rounded-lg dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-4">
        <div :class="`flex-auto flex-col cursor-pointer flex items-center justify-center w-28 ${!showTimeDropdown ? 'hover:bg-gray-700 hover:text-white' : ''} rounded-l-lg ${currentSelected === 'general' ? 'bg-gray-100 text-gray-800' : ''}`" @click="clickLeft">
          <div class="flex items-center justify-center">
            <IconClock class="mr-1" />
            <span>{{ currentGeneralTime === 1 ? t('last-hour') : (currentGeneralTime === 3 ? t('last-3-hour') : t('last-24-hour')) }}</span>
          </div>
          <div v-if="showTimeDropdown" class="absolute z-50 block w-32 h-40 text-white bg-gray-800 pointer-events-none top-14">
            <div class="flex flex-col items-center justify-center cursor-pointer pointer-events-auto">
              <div class="w-full py-3 text-center hover:bg-gray-700" @click="setTime(1)">
                {{ t('last-hour') }}
              </div>
              <div class="w-full py-3 text-center hover:bg-gray-700" @click="setTime(3)">
                {{ t('last-3-hour') }}
              </div>
              <div class="w-full py-3 text-center hover:bg-gray-700" @click="setTime(24)">
                {{ t('last-24-hour') }}
              </div>
            </div>
          </div>
        </div>
        <div class="flex-auto flex items-center justify-center mx-0 w-[1px] bg-gray-600" />
        <div :class="`flex-auto cursor-pointer flex items-center justify-center w-28 hover:bg-gray-700 rounded-r-lg ${currentSelected === 'precise' ? 'bg-gray-100 text-gray-800 hover:text-white' : ''}`" @click="clickRight">
          <div class="fixed z-50">
            <!-- <IconCalendar class="mr-1" /> -->
            <VueDatePicker
              v-model="preciseDates"
              :min-date="dayjs(thisOrganization?.subscription_start ?? 0).toDate()"
              :max-date="new Date()"
              :start-time="startTime"
              prevent-min-max-navigation
              dark
              range
              @update:model-value="clickRight"
            >
              <template #trigger>
                <div class="flex flex-row items-center justify-center h-10 w-28">
                  <IconCalendar class="mr-1" />
                  <p>
                    {{ t('custom') }}
                  </p>
                </div>
              </template>
            </VueDatePicker>
          </div>
        </div>
      </div>
    </div>
    <div class="hidden md:block">
      <table id="custom_table" class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th v-for="(col, i) in columns" :key="i" scope="col" class="px-6 py-3" :class="{ 'cursor-pointer': col.sortable }" @click="sortClick(i)">
              <div class="flex items-center">
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
        <tbody v-if="!isLoading">
          <tr
            v-for="(elem, i) in elementList" :key="i"
            :class="{ 'cursor-pointer': rowClick }"
            class="bg-white border-b dark:border-gray-700 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-600"
            @click="emit('rowClick', elem)"
          >
            <template v-for="(col, _y) in columns" :key="`${i}_${_y}`">
              <th v-if="col.head" scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                {{ displayValueKey(elem, col) }}
              </th>
              <td v-else-if="col.icon" :class="col.class" class="px-6 py-4 cursor-pointer" @click.stop="col.onClick ? col.onClick(elem) : () => {}" v-html="col.icon" />
              <td v-else class="px-6 py-4">
                {{ displayValueKey(elem, col) }}
              </td>
            </template>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="i in 10" :key="i" class="max-w-sm animate-pulse">
            <td v-for="(col, y) in columns" :key="`${i}_${y}`" class="px-6 py-4">
              <div class="max-w-[300px] rounded-full bg-gray-200 dark:bg-gray-700" :class="{ 'mb-4 h-2.5': col.head, 'h-2 mb-2.5': !col.head }" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <kList class="block !my-0 md:hidden">
      <kListItem
        v-for="(elem, i) in elementList" :key="i"
        :title="displayValueKey(elem, findMobileCol('title'))"
        :footer="displayValueKey(elem, findMobileCol('footer'))"
        :header="displayValueKey(elem, findMobileCol('header'))"
        @click="emit('rowClick', elem)"
      >
        <template #after>
          <div v-if="findMobileCol('after')?.icon" @click.stop="findMobileCol('after')?.onClick" v-html="findMobileCol('after')?.icon" />
          <span v-else>{{ displayValueKey(elem, findMobileCol('after')) }}</span>
        </template>
      </kListItem>
    </kList>
    <nav class="fixed bottom-0 left-0 z-40 flex items-center justify-between w-full p-4 bg-white md:relative dark:bg-gray-900 md:bg-transparent md:pt-4 dark:md:bg-transparent" aria-label="Table navigation">
      <span class="text-sm font-normal text-gray-500 dark:text-gray-400"><span class="hidden md:inline-block">{{ t('showing') }}</span> <span class="font-semibold text-gray-900 dark:text-white">{{ displayElemRange }}</span> of <span class="font-semibold text-gray-900 dark:text-white">{{ total }}</span></span>
      <ul class="inline-flex items-center -space-x-px">
        <li>
          <button class="block px-3 py-2 ml-0 leading-tight text-gray-500 bg-white border border-gray-300 rounded-l-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" :class="{ 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white': canPrev() }" :disabled="!canPrev()" @click="fastBackward">
            <span class="sr-only">{{ t('fast-backward') }}</span>
            <IconFastBackward />
          </button>
        </li>
        <li>
          <button class="block px-3 py-2 ml-0 leading-tight text-gray-500 bg-white border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" :class="{ 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white': canPrev() }" :disabled="!canPrev()" @click="prev">
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
          <button class="block px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" :class="{ 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white': canNext() }" :disabled="!canNext()" @click="next">
            <span class="sr-only">{{ t('next') }}</span>
            <IconNext />
          </button>
        </li>
        <li>
          <button class="block px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 rounded-r-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" :class="{ 'hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white': canNext() }" :disabled="!canNext()" @click="fastForward">
            <span class="sr-only"> {{ t('fast-forward') }} </span>
            <IconFastForward />
          </button>
        </li>
      </ul>
    </nav>
  </div>
</template>
