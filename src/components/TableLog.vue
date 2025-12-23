<script setup lang="ts">
import type { TableColumn } from './comp_def'
import type { Organization } from '~/stores/organization'
import { FormKit } from '@formkit/vue'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import { useDark, useDebounceFn } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import IconCalendar from '~icons/heroicons/calendar'
import IconClock from '~icons/heroicons/clock'
import IconDown from '~icons/ic/round-keyboard-arrow-down'
import IconFastBackward from '~icons/ic/round-keyboard-double-arrow-left'
import IconSearch from '~icons/ic/round-search?raw'
import IconSortDown from '~icons/lucide/chevron-down'
import IconSortUp from '~icons/lucide/chevron-up'
import IconSort from '~icons/lucide/chevrons-up-down'
import IconFilter from '~icons/system-uicons/filtering'
import IconReload from '~icons/tabler/reload'
import '@vuepic/vue-datepicker/dist/main.css'

interface Props {
  isLoading?: boolean
  filterText?: string
  filters?: { [key: string]: boolean }
  range?: [Date, Date]
  searchPlaceholder?: string
  search?: string
  currentPage: number
  columns: TableColumn[]
  elementList: { [key: string]: any }[]
  appId: string
  autoReload?: boolean
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
  'update:range',
  'update:columns',
  'update:currentPage',
])

// const floating: FloatingConfig = { offset: 8, arrow: true, placement: 'right', strategy: 'fixed' }
const datepicker = useTemplateRef<InstanceType<typeof VueDatePicker>>('datepicker')
const { t } = useI18n()
const isDark = useDark()
const searchVal = ref(props.search ?? '')

const filterSearchVal = ref('')
const filterDropdownOpen = ref(false)
const filterDropdownRef = ref<HTMLElement | null>(null)
const filterDropdownStyle = ref<{ top: string, left: string }>({ top: '0px', left: '0px' })

function toggleFilterDropdown() {
  if (filterDropdownOpen.value) {
    filterDropdownOpen.value = false
    return
  }
  if (filterDropdownRef.value) {
    const rect = filterDropdownRef.value.getBoundingClientRect()
    filterDropdownStyle.value = {
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
    }
  }
  filterDropdownOpen.value = true
}

function handleClickOutside(event: MouseEvent) {
  if (filterDropdownOpen.value && filterDropdownRef.value && !filterDropdownRef.value.contains(event.target as Node)) {
    const dropdown = document.querySelector('.fixed.p-2.w-64.bg-white')
    if (dropdown && !dropdown.contains(event.target as Node)) {
      filterDropdownOpen.value = false
    }
  }
}

const filterList = computed(() => {
  if (!props.filters)
    return []
  const allFilters = Object.keys(props.filters)
  if (!filterSearchVal.value)
    return allFilters
  const search = filterSearchVal.value.toLowerCase()
  return allFilters.filter(f => t(f).toLowerCase().includes(search))
})
const filterActivated = computed(() => {
  if (!props.filters)
    return 0
  return Object.keys(props.filters).reduce((acc, key) => {
    if (props.filters![key])
      acc += 1
    return acc
  }, 0)
})
const currentSelected = ref<'general' | 'precise'>('general')
type QuickHourOption = 1 | 3 | 6 | 12
const quickOptions: QuickHourOption[] = [1, 3, 6, 12]
const quickGroupLabel = computed(() => t('last'))
const currentGeneralTime = ref<QuickHourOption>(1)
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
function reloadData() {
  emit('reset')
}

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

function rangesEqual(a?: [Date, Date], b?: [Date, Date]) {
  if (!a || !b)
    return a === b
  return a[0].getTime() === b[0].getTime() && a[1].getTime() === b[1].getTime()
}

watch(() => props.range, (newRange) => {
  if (!newRange) {
    if (preciseDates.value)
      preciseDates.value = undefined
    return
  }

  if (rangesEqual(newRange, preciseDates.value))
    return

  preciseDates.value = [new Date(newRange[0]), new Date(newRange[1])]

  const start = dayjs(newRange[0])
  const end = dayjs(newRange[1])
  const diffMinutes = Math.abs(end.diff(start, 'minute'))
  const nowDiffMinutes = Math.abs(end.diff(dayjs(), 'minute'))
  const matchedOption = quickOptions.find(option => Math.abs(diffMinutes - option * 60) <= 2 && nowDiffMinutes <= 5)

  if (matchedOption) {
    currentSelected.value = 'general'
    currentGeneralTime.value = matchedOption
  }
  else {
    currentSelected.value = 'precise'
  }
}, { immediate: true })

function displayValueKey(elem: any, col: TableColumn | undefined) {
  if (!col)
    return ''
  return col.displayFunction ? col.displayFunction(elem) : elem[col.key]
}

async function fastBackward() {
  emit('fastBackward')
  emit('update:currentPage', props.currentPage - 1)
  emit('reload')
}

function clickRight() {
  currentSelected.value = 'precise'
}

function closeDatepickerMenu() {
  datepicker.value?.closeMenu?.()
}

async function setTime(time: QuickHourOption, shouldCloseMenu = false) {
  currentSelected.value = 'general'
  currentGeneralTime.value = time
  preciseDates.value = [
    dayjs().subtract(time, 'hour').toDate(),
    new Date(),
  ]
  if (shouldCloseMenu)
    closeDatepickerMenu()
}

function formatValue(previewValue: Date[] | undefined) {
  // previewValue is an array of Date objects
  // we want to return object { start: time, end: time} and handle if it's not an array or empty
  // time should be in format HH:MM
  if (!previewValue)
    return { start: dayjs().subtract(2, 'hour').format('HH:mm'), end: dayjs().format('HH:mm') }
  return {
    start: dayjs(previewValue[0]).format('HH:mm'),
    end: dayjs(previewValue[1]).format('HH:mm'),
  }
}

const calendarPreview = computed(() => {
  if (!preciseDates.value) {
    return {
      start: dayjs().subtract(1, 'hour').format('YYYY-MM-DD'),
      end: dayjs().format('YYYY-MM-DD'),
    }
  }

  return {
    start: dayjs(preciseDates.value[0]).format('YYYY-MM-DD'),
    end: dayjs(preciseDates.value[1]).format('YYYY-MM-DD'),
  }
})

const timePreview = computed(() => {
  if (!preciseDates.value) {
    return {
      start: dayjs().subtract(1, 'hour').format('HH:mm'),
      end: dayjs().format('HH:mm'),
    }
  }

  return {
    start: dayjs(preciseDates.value[0]).format('HH:mm'),
    end: dayjs(preciseDates.value[1]).format('HH:mm'),
  }
})

function quickLabel(hours: QuickHourOption) {
  if (hours === 1) {
    const single = t('one-hour-short')
    if (single && single !== 'one-hour-short')
      return single
    return '1h'
  }
  const plural = t('x-hours-short', { hours })
  if (plural && plural !== 'x-hours-short')
    return plural
  return `${hours}h`
}

function formatDurationLabel(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(Math.abs(totalMinutes)))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const parts: string[] = []
  if (days)
    parts.push(`${days}d`)
  if (hours)
    parts.push(`${hours}h`)
  if (mins || !parts.length)
    parts.push(`${mins}m`)
  return parts.join(' ')
}

const buttonLabel = computed(() => {
  if (currentSelected.value === 'general')
    return `${quickGroupLabel.value} ${quickLabel(currentGeneralTime.value)}`

  const range = preciseDates.value
  if (!range)
    return `${quickGroupLabel.value} ${quickLabel(currentGeneralTime.value)}`

  const [startDate, endDate] = range
  const start = dayjs(startDate)
  const end = dayjs(endDate)
  const now = dayjs()
  const endIsNow = Math.abs(end.diff(now, 'minute')) <= 2

  if (endIsNow) {
    const diffMinutes = Math.max(1, Math.abs(end.diff(start, 'minute')))
    return `${quickGroupLabel.value} ${formatDurationLabel(diffMinutes)}`
  }

  if (start.isSame(now, 'day') && end.isSame(now, 'day'))
    return `${start.format('HH:mm')} → ${end.format('HH:mm')}`

  if (start.isSame(end, 'day'))
    return `${start.format('D MMM HH:mm')} → ${end.format('HH:mm')}`

  return `${start.format('D MMM HH:mm')} → ${end.format('D MMM HH:mm')}`
})

function selectQuick(option: QuickHourOption) {
  if (currentSelected.value === 'general' && currentGeneralTime.value === option)
    return
  setTime(option, true)
}

function updateUrlParams() {
  const params = new URLSearchParams(window.location.search)
  if (searchVal.value)
    params.set('search', searchVal.value)
  else
    params.delete('search')
  if (preciseDates.value) {
    params.set('start', dayjs(preciseDates.value[0]).toISOString())
    params.set('end', dayjs(preciseDates.value[1]).toISOString())
  }
  else {
    params.delete('start')
    params.delete('end')
  }
  props.columns.forEach((col) => {
    if (col.sortable && col.sortable !== true)
      params.set(`sort_${col.key}`, col.sortable)
    else
      params.delete(`sort_${col.key}`)
  })
  const paramsString = params.toString() ? `?${params.toString()}` : ''
  window.history.replaceState({}, '', `${window.location.pathname}${paramsString}`)
}

function openTimePicker() {
  currentSelected.value = 'precise'
  datepicker.value?.switchView('time')
}

function loadFromUrlParams() {
  const params = new URLSearchParams(window.location.search)
  const searchParam = params.get('search')
  if (searchParam) {
    searchVal.value = searchParam
    emit('update:search', searchVal.value)
  }

  const startParam = params.get('start')
  const endParam = params.get('end')
  if (startParam && endParam) {
    const start = new Date(startParam)
    const end = new Date(endParam)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      preciseDates.value = [start, end]
      currentSelected.value = 'precise'
      emit('update:range', preciseDates.value)
    }
  }

  const newColumns = [...props.columns]
  props.columns.forEach((col) => {
    const sortParam = params.get(`sort_${col.key}`)
    if (sortParam && col.sortable && (sortParam === 'asc' || sortParam === 'desc')) {
      newColumns[props.columns.indexOf(col)].sortable = sortParam
    }
  })
  emit('update:columns', newColumns)
}

// Cleanup on unmount
onUnmounted(() => {
  const params = new URLSearchParams(window.location.search)
  params.delete('search')
  params.delete('start')
  params.delete('end')
  props.columns.forEach((col) => {
    params.delete(`sort_${col.key}`)
  })
  const paramsString = params.toString() ? `?${params.toString()}` : ''
  window.history.replaceState({}, '', `${window.location.pathname}${paramsString}`)
  document.removeEventListener('click', handleClickOutside)
})

// Add watches
watch(() => props.columns, useDebounceFn(() => {
  updateUrlParams()
  if (props.autoReload === false)
    return
  emit('reload')
}, 500), { deep: true })

watch(preciseDates, useDebounceFn(() => {
  updateUrlParams()
  // Only emit if the range actually changed from the prop value
  if (!rangesEqual(preciseDates.value, props.range)) {
    emit('update:range', preciseDates.value)
    if (props.autoReload === false)
      return
    emit('reload')
  }
}, 500))

watch(searchVal, useDebounceFn(() => {
  updateUrlParams()
  emit('update:search', searchVal.value)
  if (props.autoReload === false)
    return
  emit('reload')
}, 500))

onMounted(async () => {
  await organizationStore.awaitInitialLoad()
  thisOrganization.value = organizationStore.getOrgByAppId(props.appId) ?? null
  if (!thisOrganization.value)
    console.error('Invalid app??')
  loadFromUrlParams()
  document.addEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="pb-4 md:pb-0">
    <div class="flex items-start justify-between p-3 pb-4 overflow-visible md:items-center">
      <div class="flex h-10 md:mb-0">
        <button class="inline-flex items-center py-1.5 px-3 mr-2 text-sm font-medium text-gray-500 bg-white rounded-md border border-gray-300 dark:text-white dark:bg-gray-800 dark:border-gray-600 hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 focus:outline-hidden" type="button" @click="reloadData">
          <IconReload v-if="!isLoading" class="m-1 md:mr-2" />
          <Spinner v-else size="w-[16.8px] h-[16.8px] m-1 mr-2" />
          <span class="hidden text-sm md:block">{{ t('reload') }}</span>
        </button>
      </div>
      <div class="flex h-10 mr-2" :class="{ 'md:mr-auto': !filterText || !filterList.length }">
        <VueDatePicker
          ref="datepicker"
          v-model="preciseDates"
          :min-date="dayjs().subtract(30, 'day').toDate()"
          :max-date="dayjs().toDate()"
          :start-time="startTime"
          prevent-min-max-navigation
          :dark="isDark"
          range
          teleport="body"
          :floating="{ arrow: false }"
          :ui="{
            menu: 'custom-timepicker-button',
          }"
          @update:model-value="clickRight"
        >
          <template #trigger>
            <button
              type="button"
              class="inline-flex gap-2 items-center py-1.5 px-3 h-10 text-sm font-medium text-gray-600 bg-white rounded-md border border-gray-300 transition-colors dark:text-white dark:bg-gray-800 dark:border-gray-600 hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 dark:hover:bg-gray-700 dark:focus:ring-gray-700 focus:outline-hidden whitespace-nowrap"
            >
              <IconCalendar class="w-4 h-4 shrink-0" />
              <span class="hidden truncate md:block">
                {{ buttonLabel }}
              </span>
              <IconDown class="w-4 h-4 shrink-0" />
            </button>
          </template>
          <template #calendar-icon>
            <div class="flex items-center justify-center w-full gap-2 text-xs font-medium md:text-sm text-neutral-700 dark:text-neutral-200">
              <IconCalendar class="hidden md:block" />
              <div class="flex items-center justify-center flex-1 gap-2">
                <div class="flex flex-1 gap-2 justify-center items-center py-1.5 px-3 min-w-0 bg-gray-100 rounded-full dark:bg-gray-700">
                  <span class="w-full text-center truncate">{{ calendarPreview.start }}</span>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="text-neutral-400 dark:text-neutral-300"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
                <div class="flex flex-1 gap-2 justify-center items-center py-1.5 px-3 min-w-0 bg-gray-100 rounded-full dark:bg-gray-700">
                  <span class="w-full text-center truncate">{{ calendarPreview.end }}</span>
                </div>
              </div>
            </div>
          </template>
          <template #top-extra="{ value }">
            <div class="flex flex-col gap-2 md:mb-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="ml-2 text-xs tracking-wide text-gray-500 uppercase dark:text-neutral-400">{{ quickGroupLabel }}</span>
                <button
                  v-for="option in quickOptions"
                  :key="option"
                  type="button"
                  class="inline-flex items-center py-1.5 px-3 text-xs text-gray-600 bg-gray-50 rounded-full border transition-colors cursor-pointer md:text-sm hover:bg-gray-100 disabled:opacity-80 disabled:cursor-default border-gray-200/80 dark:border-gray-600/60 dark:bg-gray-800/60 dark:text-neutral-200 dark:hover:bg-gray-700/70 disabled:hover:bg-gray-50 disabled:dark:hover:bg-gray-800/60"
                  :class="{
                    'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100': currentSelected === 'general' && currentGeneralTime === option,
                  }"
                  :disabled="currentSelected === 'general' && currentGeneralTime === option"
                  @click.stop="selectQuick(option)"
                >
                  {{ quickLabel(option) }}
                </button>
              </div>
              <div class="flex gap-2 justify-center items-center py-1.5 px-2 w-full rounded-md transition-colors cursor-pointer hover:bg-gray-100 text-neutral-700 dark:text-neutral-200 dark:hover:bg-gray-700" @click="openTimePicker">
                <IconClock class="hidden md:block" />
                <div class="flex items-center justify-center flex-1 gap-2">
                  <div class="flex flex-1 gap-2 justify-center items-center py-1.5 px-3 min-w-0 bg-gray-100 rounded-full dark:bg-gray-700">
                    <span class="w-full text-xs font-medium text-center truncate md:text-sm">{{ formatValue(value as any).start }}</span>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="text-neutral-400 dark:text-neutral-300"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                  <div class="flex flex-1 gap-2 justify-center items-center py-1.5 px-3 min-w-0 bg-gray-100 rounded-full dark:bg-gray-700">
                    <span class="w-full text-xs font-medium text-center truncate md:text-sm">{{ formatValue(value as any).end }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <template #clock-icon>
            <div class="flex items-center justify-center w-full gap-2 text-xs font-medium md:text-sm text-neutral-700 dark:text-neutral-200">
              <IconClock class="hidden md:block" />
              <div class="flex items-center justify-center flex-1 gap-2">
                <div class="flex flex-1 gap-2 justify-center items-center py-1.5 px-3 min-w-0 bg-gray-100 rounded-full dark:bg-gray-700">
                  <span class="w-full text-center truncate">{{ timePreview.start }}</span>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="text-neutral-400 dark:text-neutral-300"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
                <div class="flex flex-1 gap-2 justify-center items-center py-1.5 px-3 min-w-0 bg-gray-100 rounded-full dark:bg-gray-700">
                  <span class="w-full text-center truncate">{{ timePreview.end }}</span>
                </div>
              </div>
            </div>
          </template>
        </VueDatePicker>
      </div>
      <div v-if="filterText && filterList.length" ref="filterDropdownRef" class="relative h-10 mr-2 md:mr-auto">
        <button
          type="button"
          class="relative inline-flex items-center py-1.5 px-3 h-full text-sm font-medium text-gray-500 bg-white rounded-md border border-gray-300 cursor-pointer dark:text-white dark:bg-gray-800 dark:border-gray-600 hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700 focus:outline-hidden"
          @click="toggleFilterDropdown"
        >
          <div
            v-if="filterActivated"
            class="inline-flex absolute -top-2 -right-2 justify-center items-center w-6 h-6 text-xs font-bold text-white bg-red-500 rounded-full border-2 border-white dark:border-gray-900"
          >
            {{ filterActivated }}
          </div>
          <IconFilter class="mr-2 w-4 h-4" />
          <span class="hidden md:block">{{ t(filterText) }}</span>
          <IconDown class="hidden ml-2 w-4 h-4 md:block" />
        </button>
        <Teleport to="body">
          <div
            v-if="filterDropdownOpen"
            class="fixed p-2 w-64 bg-white shadow-lg rounded-lg z-9999 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            :style="filterDropdownStyle"
            @click.stop
          >
            <input
              v-model="filterSearchVal"
              type="text"
              :placeholder="t('search')"
              class="w-full px-3 py-2 mb-2 text-sm border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              @click.stop
            >
            <ul class="max-h-64 overflow-y-auto">
              <li v-for="(f, i) in filterList" :key="i">
                <div
                  class="flex items-center p-2 rounded-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <input
                    :id="`filter-radio-example-${i}`" :checked="filters?.[f]" type="checkbox"
                    :name="`filter-radio-${i}`"
                    class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:ring-offset-gray-800 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 dark:focus:ring-offset-gray-800"
                    @change="
                      emit('update:filters', { ...filters, [f]: !filters?.[f] })
                    "
                  >
                  <label
                    :for="`filter-radio-example-${i}`"
                    class="ml-2 w-full text-sm font-medium text-gray-900 rounded-sm dark:text-gray-300"
                  >{{ t(f) }}</label>
                </div>
              </li>
              <li v-if="filterList.length === 0" class="p-2 text-sm text-gray-500 dark:text-gray-400 text-center">
                {{ t('no-results') }}
              </li>
            </ul>
          </div>
        </Teleport>
      </div>
      <div class="flex overflow-hidden md:w-auto">
        <FormKit
          v-model="searchVal"
          :placeholder="searchPlaceholder"
          :prefix-icon="IconSearch" :disabled="isLoading"
          enterkeyhint="send"
          :classes="{
            outer: 'mb-0! md:w-96',
          }"
        />
      </div>
    </div>
    <div class="block overflow-x-auto">
      <table id="custom_table" class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:text-gray-400 dark:bg-gray-700">
          <tr>
            <th v-for="(col, i) in columns" :key="i" scope="col" class="px-1 py-3 md:px-6" :class="{ 'cursor-pointer': col.sortable, 'hidden md:table-cell': !col.mobile }" @click="sortClick(i)">
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
            class="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            <template v-for="(col, _y) in columns" :key="`${i}_${_y}`">
              <th v-if="col.head" :class="`${col.class} ${!col.mobile ? 'hidden md:table-cell' : ''} ${col.onClick ? 'cursor-pointer hover:underline clickable-cell' : ''}`" scope="row" class="px-1 py-1 font-medium text-gray-900 whitespace-nowrap md:py-4 md:px-6 dark:text-white" @click.stop="col.onClick ? col.onClick(elem) : () => {}">
                {{ displayValueKey(elem, col) }}
              </th>
              <td v-else-if="col.icon" :class="`${col.class} ${!col.mobile ? 'hidden md:table-cell' : ''}`" class="px-1 py-1 cursor-pointer md:py-4 md:px-6" @click.stop="col.onClick ? col.onClick(elem) : () => {}">
                <component :is="col.icon" />
              </td>
              <td v-else :class="`${col.class} ${!col.mobile ? 'hidden md:table-cell' : ''} ${col.onClick ? 'cursor-pointer hover:underline clickable-cell' : ''}`" class="px-1 py-1 md:py-4 md:px-6" @click.stop="col.onClick ? col.onClick(elem) : () => {}">
                {{ displayValueKey(elem, col) }}
              </td>
            </template>
          </tr>
        </tbody>
        <tbody v-else-if="!isLoading && elementList.length === 0">
          <tr>
            <td :colspan="columns.length" class="px-1 py-1 text-center text-gray-500 md:py-4 md:px-6 dark:text-gray-400">
              {{ t('no_elements_found') }}
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="i in 10" :key="i" class="max-w-sm" :class="{ 'animate-pulse duration-1000': isLoading }">
            <td v-for="(col, y) in columns" :key="`${i}_${y}`" class="px-1 py-1 md:py-4 md:px-6">
              <div class="bg-gray-200 rounded-full dark:bg-gray-700 max-w-[300px]" :class="{ 'mb-4 h-2.5': col.head, 'h-2 mb-2.5': !col.head }" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav class="fixed bottom-0 left-0 z-40 flex items-center justify-between w-full p-4 bg-white md:relative md:pt-4 md:bg-transparent dark:bg-gray-900 dark:md:bg-transparent" aria-label="Table navigation">
      <button
        class="flex items-center justify-center h-10 px-4 py-2 space-x-2 text-sm font-medium transition-colors border border-gray-300 rounded-md whitespace-nowrap dark:text-white dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background dark:hover:bg-primary/90 hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-ring"
        @click="fastBackward"
      >
        <IconFastBackward />
        <span>Load older</span>
      </button>
    </nav>
  </div>
</template>

<style>
@reference "../styles/style.css";

/* VueDatePicker theming using CSS variables - Capgo theme */
.dp__theme_light {
  --dp-background-color: var(--color-white);
  --dp-text-color: var(--color-black-light);
  --dp-hover-color: var(--color-gray-300);
  --dp-hover-text-color: var(--color-black-light);
  --dp-hover-icon-color: var(--color-grey-500);
  --dp-primary-color: var(--color-primary-500);
  --dp-primary-disabled-color: var(--color-grey-500);
  --dp-primary-text-color: var(--color-white);
  --dp-secondary-color: var(--color-grey-500);
  --dp-border-color: var(--color-grey-500);
  --dp-menu-border-color: var(--color-misty-rose-300);
  --dp-border-color-hover: var(--color-grey-500);
  --dp-border-color-focus: var(--color-primary-500);
  --dp-disabled-color: var(--color-misty-rose-50);
  --dp-disabled-color-text: var(--color-grey-500);
  --dp-scroll-bar-background: var(--color-misty-rose-400);
  --dp-scroll-bar-color: var(--color-grey-500);
  --dp-success-color: var(--color-success-500);
  --dp-success-color-disabled: var(--color-vista-blue-200);
  --dp-icon-color: var(--color-grey-500);
  --dp-danger-color: var(--color-danger-500);
  --dp-marker-color: var(--color-primary-500);
  --dp-tooltip-color: var(--color-misty-rose-50);
  --dp-highlight-color: color-mix(in srgb, var(--color-primary-500) 10%, transparent);
  --dp-range-between-dates-background-color: color-mix(in srgb, var(--color-primary-500) 10%, transparent);
  --dp-range-between-dates-text-color: var(--color-primary-500);
  --dp-range-between-border-color: color-mix(in srgb, var(--color-primary-500) 20%, transparent);
}

.dp__menu_inner {
  --dp-menu-padding: 0.5rem;
}

.dp__theme_dark {
  --dp-background-color: var(--color-base-100);
  --dp-text-color: var(--color-base-content);
  --dp-hover-color: var(--color-gray-700);
  --dp-hover-text-color: var(--color-base-content);
  --dp-hover-icon-color: var(--color-grey-500);
  --dp-primary-color: var(--color-secondary-500);
  --dp-primary-disabled-color: var(--color-dusk-700);
  --dp-primary-text-color: var(--color-white);
  --dp-secondary-color: var(--color-grey-500);
  --dp-border-color: var(--color-dusk-700);
  --dp-menu-border-color: var(--color-dusk-800);
  --dp-border-color-hover: var(--color-grey-500);
  --dp-border-color-focus: var(--color-secondary-500);
  --dp-disabled-color: var(--color-dusk-800);
  --dp-disabled-color-text: var(--color-grey-500);
  --dp-scroll-bar-background: var(--color-base-100);
  --dp-scroll-bar-color: var(--color-dusk-700);
  --dp-success-color: var(--color-success-500);
  --dp-success-color-disabled: var(--color-vista-blue-900);
  --dp-icon-color: var(--color-grey-500);
  --dp-danger-color: var(--color-muted-blue-500);
  --dp-marker-color: var(--color-secondary-500);
  --dp-tooltip-color: var(--color-dusk-800);
  --dp-highlight-color: color-mix(in srgb, var(--color-secondary-500) 20%, transparent);
  --dp-range-between-dates-background-color: color-mix(in srgb, var(--color-secondary-500) 20%, transparent);
  --dp-range-between-dates-text-color: var(--color-base-content);
  --dp-range-between-border-color: color-mix(in srgb, var(--color-secondary-500) 30%, transparent);
}

/* Global datepicker variables matching Capgo design */
:root {
  --dp-font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --dp-border-radius: 0.5rem;
  --dp-cell-border-radius: 0.375rem;
  --dp-common-transition: all 0.2s ease-in-out;
  --dp-button-height: 2.5rem;
  --dp-action-button-height: 2.5rem;
  --dp-month-year-row-height: 2.5rem;
  --dp-month-year-row-button-size: 2rem;
  --dp-button-icon-height: 1.25rem;
  --dp-cell-size: 2.5rem;
  --dp-cell-padding: 0.5rem;
  --dp-common-padding: 0.75rem;
  --dp-input-icon-padding: 2.5rem;
  --dp-input-padding: 0.5rem 0.75rem;
  --dp-menu-min-width: 20rem;
  --dp-action-buttons-padding: 0.5rem;
  --dp-row-margin: 0.25rem 0;
  --dp-calendar-header-cell-padding: 0.75rem;
  --dp-two-calendars-spacing: 1rem;
  --dp-overlay-col-padding: 0.5rem;
  --dp-time-inc-dec-button-size: 2rem;
  --dp-menu-padding: 1rem;
  --dp-font-size: 0.875rem;
  --dp-preview-font-size: 0.75rem;
  --dp-time-font-size: 2rem;
  --dp-animation-duration: 0.2s;
  --dp-menu-appear-transition-timing: cubic-bezier(0.4, 0, 0.2, 1);
  --dp-transition-timing: ease-out;
}

.dp__action_row {
  justify-content: space-evenly;
}

.dp__selection_preview {
  display: none !important;
}

.dp__inner_nav {
  border-radius: 0.5rem;
}

.dp__inc_dec_button {
  border-radius: 0.5rem;
}
/* Custom action buttons styling for Capgo */
.dp__menu.custom-timepicker-button .dp__action_row {
  width: 100% !important;
  padding: 0.5rem !important;
}

.dp__menu.custom-timepicker-button .dp__action_row .dp__action_buttons {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  gap: 0.5rem !important;
  width: 100% !important;
  flex: 1 !important;
}

.dp__menu.custom-timepicker-button .dp__action_row .dp__action_buttons .dp__action_cancel,
.dp__menu.custom-timepicker-button .dp__action_row .dp__action_buttons .dp__action_select {
  flex: 1 !important;
  max-width: 47% !important;
  min-width: 47% !important;
  width: 47% !important;
  justify-content: center !important;
  text-align: center !important;
}

.dp--tp-wrap > .dp__btn.dp__button {
  display: none !important;
}
.dp__btn.dp__month_year_select {
  margin-left: 0.5rem !important;
  margin-right: 0.5rem !important;
}

/* Make date picker popup fixed to viewport */
.dp__menu {
  position: fixed !important;
  z-index: 9999 !important;
  width: 320px !important;
  min-width: 320px !important;
  max-width: 320px !important;
  box-shadow:
    0 10px 15px -3px rgb(0 0 0 / 0.1),
    0 4px 6px -4px rgb(0 0 0 / 0.1) !important;
  border: 1px solid rgb(229 231 235) !important;
  margin: 0 !important;
  overflow: visible !important;
}

/* Ensure menu container is never clipped */
.dp__outer_menu_wrap {
  z-index: 9999 !important;
  position: fixed !important;
  overflow: visible !important;
}

/* Override any parent overflow settings */
body > .dp__outer_menu_wrap {
  overflow: visible !important;
}

/* Mobile responsive calendar - only when menu is visible */
@media (max-width: 768px) {
  .dp__outer_menu_wrap:has(.dp__menu) {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(0, 0, 0, 0.5) !important;
  }

  .dp__menu {
    position: relative !important;
    width: calc(100vw - 2rem) !important;
    min-width: calc(100vw - 2rem) !important;
    max-width: calc(100vw - 2rem) !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    transform: none !important;
  }
}

/* Dark mode menu styling */
.dark .dp__menu {
  border-color: rgb(55 65 81) !important;
  box-shadow:
    0 10px 15px -3px rgb(0 0 0 / 0.3),
    0 4px 6px -4px rgb(0 0 0 / 0.3) !important;
}

/* Arrow styling to match menu border */
.dp__arrow_top {
  border-top-color: rgb(55 65 81) !important;
  border-right-color: rgb(55 65 81) !important;
}

/* Prevent calendar from resizing during range selection */
.dp__calendar {
  width: 100% !important;
  max-width: 100% !important;
}

.dp__calendar_wrap {
  width: 100% !important;
}

/* Fix calendar row width */
.dp__calendar_row {
  width: 100% !important;
  display: flex !important;
  justify-content: space-between !important;
}

/* Ensure consistent calendar item sizing */
.dp__calendar_item {
  flex: 1 !important;
  min-width: 0 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
}

/* Fix range selection display */
.dp__range_between,
.dp__range_start,
.dp__range_end {
  width: 100% !important;
}
</style>
