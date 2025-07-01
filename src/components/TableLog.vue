<script setup lang="ts">
import type { DatePickerInstance } from '@vuepic/vue-datepicker'
import type { TableColumn } from './comp_def'
import type { Organization } from '~/stores/organization'
import { FormKit } from '@formkit/vue'
import VueDatePicker from '@vuepic/vue-datepicker'
import { useDark, useDebounceFn } from '@vueuse/core'
import dayjs from 'dayjs'
import { useI18n } from 'petite-vue-i18n'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import IconCalendar from '~icons/heroicons/calendar'
import IconClock from '~icons/heroicons/clock'
import IconFastBackward from '~icons/ic/round-keyboard-double-arrow-left'
import IconSearch from '~icons/ic/round-search?raw'
import IconSortDown from '~icons/lucide/chevron-down'
import IconSortUp from '~icons/lucide/chevron-up'
import IconSort from '~icons/lucide/chevrons-up-down'
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
const datepicker = ref<DatePickerInstance>(null)
const dropdown = useTemplateRef('dropdown')
function closeDropdown() {
  if (dropdown.value) {
    dropdown.value.removeAttribute('open')
  }
}
const { t } = useI18n()
const isDark = useDark()
const searchVal = ref(props.search ?? '')
const currentSelected = ref<'general' | 'precise'>('general')
type Minutes = 1 | 3 | 12
const currentGeneralTime = ref<Minutes>(1)
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
function resetTime() {
  setTime(currentGeneralTime.value)
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

watch(props.columns, () => {
  emit('reload')
})
if (props.filters) {
  watch(props.filters, () => {
    emit('reload')
  })
}
watch(preciseDates, () => {
  // console.log('preciseDates', preciseDates.value)
  emit('update:range', preciseDates.value)
  emit('reload')
})

watch(searchVal, useDebounceFn(() => {
  emit('update:search', searchVal.value)
  emit('reload')
}, 500))

function displayValueKey(elem: any, col: TableColumn | undefined) {
  if (!col)
    return ''
  return col.displayFunction ? col.displayFunction(elem) : elem[col.key]
}

async function fastBackward() {
  console.log('fastBackward')
  emit('fastBackward')
  emit('update:currentPage', props.currentPage - 1)
  emit('reload')
}

async function clickRight() {
  currentSelected.value = 'precise'
}

async function setTime(time: Minutes) {
  currentSelected.value = 'general'
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
      dayjs().subtract(12, 'hour').toDate(),
      new Date(),
    ]
  }
  closeDropdown()
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

function updateUrlParams() {
  const params = new URLSearchParams()
  if (searchVal.value)
    params.set('search', searchVal.value)
  if (preciseDates.value) {
    params.set('start', dayjs(preciseDates.value[0]).toISOString())
    params.set('end', dayjs(preciseDates.value[1]).toISOString())
  }
  props.columns.forEach((col) => {
    if (col.sortable && col.sortable !== true)
      params.set(`sort_${col.key}`, col.sortable)
  })
  const paramsString = params.toString() ? `?${params.toString()}` : ''
  window.history.pushState({}, '', `${window.location.pathname}${paramsString}`)
}

function openTimePicker() {
  console.log('openTimePicker')
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
  emit('reload')
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
  window.history.pushState({}, '', `${window.location.pathname}${paramsString}`)
})

// Add watches
watch(() => props.columns, useDebounceFn(() => {
  updateUrlParams()
  emit('reload')
}, 500), { deep: true })

watch(preciseDates, useDebounceFn(() => {
  updateUrlParams()
  emit('update:range', preciseDates.value)
  emit('reload')
}, 500))

watch(searchVal, useDebounceFn(() => {
  updateUrlParams()
  emit('update:search', searchVal.value)
  emit('reload')
}, 500))

onMounted(async () => {
  await organizationStore.awaitInitialLoad()
  thisOrganization.value = organizationStore.getOrgByAppId(props.appId) ?? null
  if (!thisOrganization.value)
    console.error('Invalid app??')
  loadFromUrlParams()
})
</script>

<template>
  <div class="pb-4 overflow-x-auto md:pb-0">
    <div class="flex items-start justify-between p-3 pb-4 md:items-center">
      <div class="flex h-10 md:mb-0">
        <button class="mr-2 inline-flex items-center border border-gray-300 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-800 hover:bg-gray-100 dark:text-white focus:outline-hidden focus:ring-4 focus:ring-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-700" type="button" @click="resetTime">
          <IconReload v-if="!isLoading" class="m-1 md:mr-2" />
          <Spinner v-else size="w-[16.8px] h-[16.8px] m-1 mr-2" />
          <span class="hidden text-sm md:block">{{ t('reload') }}</span>
        </button>
      </div>
      <div class="flex h-10 mr-2 md:mr-auto text-sm font-medium text-gray-500 border border-gray-200 divide-gray-100 rounded-md dark:divide-gray-300 md:ml-4 dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:outline-hidden focus:ring-4">
        <div ref="dropdown" class="dropdown dropdown-right">
          <button
            tabindex="0"
            class="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-l-md h-full"
            :class="{ 'bg-gray-50 dark:bg-gray-700': currentSelected === 'general' }"
          >
            <IconClock class="h-4 w-4" />
            <span class="text-sm font-medium hidden md:block">
              {{ currentGeneralTime === 1 ? t('last-hour') : (currentGeneralTime === 3 ? t('last-3-hours') : t('last-12-hours')) }}
            </span>
          </button>
          <ul class="p-2 bg-white shadow dropdown-content menu dark:bg-base-200 rounded-box z-1 w-52">
            <li><a :class="{ 'bg-gray-300 dark:bg-gray-400': currentGeneralTime === 1 }" @click="setTime(1)">{{ t('last-hour') }}</a></li>
            <li><a :class="{ 'bg-gray-300 dark:bg-gray-400': currentGeneralTime === 3 }" @click="setTime(3)">{{ t('last-3-hours') }}</a></li>
            <li><a :class="{ 'bg-gray-300 dark:bg-gray-400': currentGeneralTime === 12 }" @click="setTime(12)">{{ t('last-12-hours') }}</a></li>
          </ul>
        </div>
        <div class="flex-auto flex items-center justify-center mx-0 w-px bg-gray-200 dark:bg-gray-600" />
        <div class="flex items-center justify-center flex-auto rounded-r-md cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700" :class="{ 'bg-gray-100 text-gray-600 dark:text-gray-300 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-900': currentSelected === 'precise' }" @click="clickRight">
          <div class="relative">
            <VueDatePicker
              ref="datepicker"
              v-model="preciseDates"
              position="right"
              :min-date="dayjs().subtract(30, 'day').toDate()"
              :max-date="dayjs().toDate()"
              :start-time="startTime"
              prevent-min-max-navigation
              :dark="isDark"
              range
              :ui="{
                menu: 'custom-timepicker-button',
              }"
              @update:model-value="clickRight"
            >
              <template #trigger>
                <div class="flex flex-row items-center justify-center h-10 px-3 md:px-6">
                  <IconCalendar class="mr-1" />
                  <p class="hidden md:block">
                    {{ t('custom') }}
                  </p>
                </div>
              </template>
              <template #top-extra="{ value }">
                <div class="flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-700 md:mb-2 rounded-full" @click="openTimePicker">
                  <div class="flex items-center space-x-2 text-neutral-700 dark:text-neutral-200 bg-gray-300 dark:bg-gray-700 px-3 py-2 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="w-5 h-5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span class="font-inter">{{ formatValue(value as any).start }}</span>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="w-5 h-5 mx-4 text-neutral-600 dark:text-neutral-400"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                  <div class="flex items-center space-x-2 text-neutral-700 dark:text-neutral-200 bg-gray-300 dark:bg-gray-700 px-3 py-2 rounded-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="w-5 h-5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span class="font-inter">{{ formatValue(value as any).end }}</span>
                  </div>
                </div>
              </template>
            </VueDatePicker>
          </div>
        </div>
      </div>
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
      <table id="custom_table" class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th v-for="(col, i) in columns" :key="i" scope="col" class="px-1 md:px-6 py-3" :class="{ 'cursor-pointer': col.sortable, 'hidden md:table-cell': !col.mobile }" @click="sortClick(i)">
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
            <template v-for="(col, _y) in columns" :key="`${i}_${_y}`">
              <th v-if="col.head" :class="`${col.class} ${!col.mobile ? 'hidden md:table-cell' : ''} ${col.onClick ? 'cursor-pointer hover:underline clickable-cell' : ''}`" scope="row" class="px-1 md:px-6 py-1 md:py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white" @click.stop="col.onClick ? col.onClick(elem) : () => {}">
                {{ displayValueKey(elem, col) }}
              </th>
              <td v-else-if="col.icon" :class="`${col.class} ${!col.mobile ? 'hidden md:table-cell' : ''}`" class="px-1 md:px-6 py-1 md:py-4 cursor-pointer" @click.stop="col.onClick ? col.onClick(elem) : () => {}" v-html="col.icon" />
              <td v-else :class="`${col.class} ${!col.mobile ? 'hidden md:table-cell' : ''} ${col.onClick ? 'cursor-pointer hover:underline clickable-cell' : ''}`" class="px-1 md:px-6 py-1 md:py-4" @click.stop="col.onClick ? col.onClick(elem) : () => {}">
                {{ displayValueKey(elem, col) }}
              </td>
            </template>
          </tr>
        </tbody>
        <tbody v-else-if="!isLoading && elementList.length === 0">
          <tr>
            <td :colspan="columns.length" class="py-1 md:py-4 px-1 md:px-6 text-center text-gray-500 dark:text-gray-400">
              {{ t('no_elements_found') }}
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="i in 10" :key="i" class="max-w-sm" :class="{ 'animate-pulse duration-1000': isLoading }">
            <td v-for="(col, y) in columns" :key="`${i}_${y}`" class="px-1 md:px-6 py-1 md:py-4">
              <div class="max-w-[300px] rounded-full bg-gray-200 dark:bg-gray-700" :class="{ 'mb-4 h-2.5': col.head, 'h-2 mb-2.5': !col.head }" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav class="fixed bottom-0 left-0 z-40 flex items-center justify-between w-full p-4 bg-white md:relative dark:bg-gray-900 md:bg-transparent md:pt-4 dark:md:bg-transparent" aria-label="Table navigation">
      <button
        class="flex items-center justify-center h-10 px-4 py-2 space-x-2 text-sm font-medium transition-colors border border-gray-300 rounded-md dark:text-white dark:border-gray-700 whitespace-nowrap ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/10 dark:hover:bg-primary/90"
        @click="fastBackward"
      >
        <IconFastBackward />
        <span>Load older</span>
      </button>
    </nav>
  </div>
</template>

<style>
@plugin "daisyui";
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

/* Custom action buttons styling for Capgo */
.custom-timepicker-button > .dp__action_row > .dp__action_buttons > .dp__action_cancel {
  @apply btn btn-outline btn-sm;
  width: 49%;
}
.custom-timepicker-button > .dp__action_row > .dp__action_buttons > .dp__action_select {
  @apply btn btn-outline btn-primary btn-sm;
  width: 49%;
}
.custom-timepicker-button > .dp__action_row > .dp__action_buttons {
  display: contents !important;
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
  z-index: 1000 !important;
  width: 320px !important;
  min-width: 320px !important;
  max-width: 320px !important;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1) !important;
  border: 1px solid rgb(229 231 235) !important;
}

/* Mobile responsive calendar */
@media (max-width: 768px) {
  .dp__menu {
    width: calc(100vw - 2rem) !important;
    min-width: calc(100vw - 2rem) !important;
    max-width: calc(100vw - 2rem) !important;
    left: 1rem !important;
    right: 1rem !important;
    transform: none !important;
  }
}

/* Dark mode menu styling */
.dark .dp__menu {
  border-color: rgb(55 65 81) !important;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3), 0 4px 6px -4px rgb(0 0 0 / 0.3) !important;
}

/* Arrow styling to match menu border */
.dp__arrow_top {
  border-top-color: rgb(229 231 235) !important;
  border-right-color: rgb(229 231 235) !important;
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
