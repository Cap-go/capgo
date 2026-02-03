<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import IconExternalLink from '~icons/heroicons/arrow-top-right-on-square'
import IconPuzzle from '~icons/heroicons/puzzle-piece'
import IconAlertCircle from '~icons/lucide/alert-circle'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

interface NativePackage {
  name: string
  version: string
}

type VersionRow = Pick<Database['public']['Tables']['app_versions']['Row'], 'id' | 'name' | 'created_at' | 'manifest_count' | 'app_id'>

const route = useRoute()
const router = useRouter()
const displayStore = useDisplayStore()
const { t } = useI18n()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const tableLoading = ref(false)
const version = ref<Database['public']['Tables']['app_versions']['Row']>()
const selectedCompareVersion = ref<VersionRow | null>(null)
const comparePackages = ref<NativePackage[]>([])
const comparePackagesCache = ref<Record<number, NativePackage[]>>({})
const compareRequestId = ref(0)

const nativePackages = computed<NativePackage[]>(() => {
  if (!version.value?.native_packages)
    return []
  return (version.value.native_packages as unknown as NativePackage[]) ?? []
})

const compareVersionId = computed(() => selectedCompareVersion.value?.id ?? null)

const compareMap = computed(() => new Map(comparePackages.value.map(pkg => [pkg.name, pkg.version])))

const diffPackages = computed(() => {
  if (!compareVersionId.value)
    return nativePackages.value
  return nativePackages.value.filter(pkg => compareMap.value.get(pkg.name) !== pkg.version)
})

const unchangedPackages = computed(() => {
  if (!compareVersionId.value)
    return []
  return nativePackages.value.filter(pkg => compareMap.value.get(pkg.name) === pkg.version)
})

const displayPackages = computed(() => (compareVersionId.value ? diffPackages.value : nativePackages.value))

const uniqueVersionsCount = computed(() => new Set(nativePackages.value.map(pkg => pkg.version)).size)

const compareStatusMessage = computed(() => {
  if (!nativePackages.value.length)
    return ''
  if (compareVersionId.value && tableLoading.value)
    return t('loading')
  if (!compareVersionId.value)
    return t('dependencies-status-full')
  const compareName = selectedCompareVersion.value?.name ?? t('unknown')
  if (comparePackages.value.length === 0)
    return t('dependencies-status-compare-empty', { bundle: compareName })
  if (diffPackages.value.length === 0)
    return t('dependencies-diff-empty', { unchanged: unchangedPackages.value.length })
  return t('dependencies-status-diff', {
    bundle: compareName,
    count: diffPackages.value.length,
    unchanged: unchangedPackages.value.length,
  })
})

function openNpmPackage(packageName: string) {
  window.open(`https://www.npmjs.com/package/${packageName}`, '_blank', 'noopener,noreferrer')
}

async function fetchComparePackages(versionId: number) {
  if (!packageId.value)
    return []
  const { data, error } = await supabase
    .from('app_versions')
    .select('id, native_packages')
    .eq('app_id', packageId.value)
    .eq('id', versionId)
    .single()

  if (error) {
    console.error('Failed to load compare dependencies', error)
    return []
  }

  return (data?.native_packages as unknown as NativePackage[]) ?? []
}

async function getVersion() {
  if (!id.value)
    return

  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('id', id.value)
      .single()

    if (error) {
      console.error('no version', error)
      return
    }

    version.value = data

    if (version.value?.name)
      displayStore.setBundleName(String(version.value.id), version.value.name)
    displayStore.NavTitle = version.value?.name ?? t('bundle')
  }
  catch (error) {
    console.error(error)
  }
}

function resetCompareSelection() {
  selectedCompareVersion.value = null
  comparePackages.value = []
  tableLoading.value = false
}

watch(compareVersionId, async (value) => {
  const requestId = ++compareRequestId.value
  if (!value) {
    comparePackages.value = []
    tableLoading.value = false
    return
  }

  const cached = comparePackagesCache.value[value]
  if (cached) {
    comparePackages.value = cached
    tableLoading.value = false
    return
  }

  tableLoading.value = true
  const packages = await fetchComparePackages(value)
  if (requestId !== compareRequestId.value)
    return
  comparePackagesCache.value[value] = packages
  comparePackages.value = packages
  tableLoading.value = false
})

watchEffect(async () => {
  if (route.path.includes('/bundle/') && route.path.includes('/dependencies')) {
    const params = route.params as { package?: string, bundle?: string }
    loading.value = true
    packageId.value = params.package as string
    id.value = Number(params.bundle as string)
    comparePackagesCache.value = {}
    resetCompareSelection()
    await getVersion()
    loading.value = false
    if (!version.value?.name)
      displayStore.NavTitle = t('bundle')
    displayStore.defaultBack = `/app/${params.package}/bundles`
  }
})
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col justify-center items-center min-h-[50vh]">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else-if="version">
      <div class="w-full h-full px-0 pt-0 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
          <!-- Header -->
          <div class="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">
              {{ t('native-dependencies') }}
            </h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ t('native-dependencies-description') }}
            </p>
          </div>

          <template v-if="nativePackages.length > 0">
            <div class="px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700">
              <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <BundleCompareSelect
                  v-model="selectedCompareVersion"
                  :app-id="packageId"
                  :current-version-id="id"
                  :label="t('dependencies-compare-label')"
                  :none-label="t('dependencies-compare-none')"
                  :latest-label="t('dependencies-compare-latest')"
                  :results-label="t('dependencies-compare-results')"
                  :search-placeholder="t('search-by-name-or-bundle-id')"
                  :no-results-label="t('no-versions-found')"
                  :disabled="loading"
                  :show-spinner="tableLoading"
                />

                <div v-if="!compareVersionId" class="grid w-full grid-cols-2 gap-4 text-right md:w-auto md:text-left">
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <div class="uppercase tracking-wide">
                      {{ t('dependencies-summary-packages') }}
                    </div>
                    <div class="text-lg font-semibold text-slate-900 dark:text-white">
                      {{ nativePackages.length }}
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <div class="uppercase tracking-wide">
                      {{ t('dependencies-summary-versions') }}
                    </div>
                    <div class="text-lg font-semibold text-slate-900 dark:text-white">
                      {{ uniqueVersionsCount }}
                    </div>
                  </div>
                </div>

                <div v-else class="grid w-full grid-cols-2 gap-3 text-right md:w-auto md:grid-cols-4 md:text-left">
                  <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <div class="uppercase tracking-wide">
                      {{ t('dependencies-changed-packages') }}
                    </div>
                    <div class="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
                      {{ diffPackages.length }}
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <div class="uppercase tracking-wide">
                      {{ t('dependencies-unchanged-packages') }}
                    </div>
                    <div class="text-lg font-semibold text-slate-900 dark:text-white">
                      {{ unchangedPackages.length }}
                    </div>
                  </div>
                  <div class="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 md:col-span-2">
                    <div class="uppercase tracking-wide">
                      {{ t('dependencies-total-packages') }}
                    </div>
                    <div class="text-base font-semibold text-slate-700 dark:text-slate-200">
                      {{ nativePackages.length }}
                    </div>
                  </div>
                </div>
              </div>
              <p v-if="compareStatusMessage" class="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {{ compareStatusMessage }}
              </p>
              <p v-if="compareVersionId" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {{ t('dependencies-compare-note') }}
              </p>
            </div>

            <div class="px-2 pb-2 relative">
              <div v-if="displayPackages.length > 0" class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead class="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th scope="col" class="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                        {{ t('package-name') }}
                      </th>
                      <th scope="col" class="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase dark:text-gray-400">
                        {{ t('version') }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                    <tr v-for="(pkg, index) in displayPackages" :key="index" class="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td class="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap dark:text-gray-100">
                        <div class="flex items-center gap-2">
                          <IconPuzzle class="w-4 h-4 text-gray-400" />
                          {{ pkg.name }}
                          <button
                            class="p-1 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                            :title="t('view-on-npm')"
                            @click="openNpmPackage(pkg.name)"
                          >
                            <IconExternalLink class="w-4 h-4 text-gray-400 cursor-pointer hover:text-blue-500 dark:hover:text-blue-400" />
                          </button>
                        </div>
                      </td>
                      <td class="px-6 py-4 text-sm text-gray-500 whitespace-nowrap dark:text-gray-400">
                        <span class="px-2 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded-full dark:text-blue-200 dark:bg-blue-900">
                          {{ pkg.version }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-else-if="compareVersionId && !tableLoading" class="flex flex-col items-center justify-center px-4 py-12">
                <IconPuzzle class="w-16 h-16 mb-4 text-gray-400 dark:text-gray-500" />
                <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {{ t('dependencies-no-changes') }}
                </h4>
                <p class="mt-1 text-sm text-center text-gray-500 dark:text-gray-400">
                  {{ compareStatusMessage }}
                </p>
              </div>

              <div
                v-if="tableLoading"
                class="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70"
              >
                <Spinner size="w-10 h-10" />
              </div>
            </div>
          </template>

          <div v-else class="flex flex-col items-center justify-center px-4 py-12">
            <IconPuzzle class="w-16 h-16 mb-4 text-gray-400 dark:text-gray-500" />
            <h4 class="text-lg font-medium text-gray-900 dark:text-gray-100">
              {{ t('no-native-dependencies') }}
            </h4>
            <p class="mt-1 text-sm text-center text-gray-500 dark:text-gray-400">
              {{ t('no-native-dependencies-description') }}
            </p>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('bundle-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('bundle-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="router.push(`/app/${packageId}/bundles`)">
        {{ t('back-to-bundles') }}
      </button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
