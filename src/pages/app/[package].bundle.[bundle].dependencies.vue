<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconExternalLink from '~icons/heroicons/arrow-top-right-on-square'
import IconPuzzle from '~icons/heroicons/puzzle-piece'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

interface NativePackage {
  name: string
  version: string
}

const route = useRoute('/app/[package].bundle.[bundle].dependencies')
const router = useRouter()
const displayStore = useDisplayStore()
const { t } = useI18n()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>(0)
const loading = ref(true)
const version = ref<Database['public']['Tables']['app_versions']['Row']>()

const nativePackages = computed<NativePackage[]>(() => {
  if (!version.value?.native_packages)
    return []
  return (version.value.native_packages as NativePackage[]) ?? []
})

function openNpmPackage(packageName: string) {
  window.open(`https://www.npmjs.com/package/${packageName}`, '_blank', 'noopener,noreferrer')
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

watchEffect(async () => {
  if (route.path.includes('/bundle/') && route.path.includes('/dependencies')) {
    loading.value = true
    packageId.value = route.params.package as string
    id.value = Number(route.params.bundle as string)
    await getVersion()
    loading.value = false
    if (!version.value?.name)
      displayStore.NavTitle = t('bundle')
    displayStore.defaultBack = `/app/${route.params.package}/bundles`
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

          <!-- Dependencies Table -->
          <div v-if="nativePackages.length > 0" class="overflow-x-auto">
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
                <tr v-for="(pkg, index) in nativePackages" :key="index" class="hover:bg-gray-50 dark:hover:bg-gray-700">
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

          <!-- Empty state -->
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
