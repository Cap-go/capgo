<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { useDebounceFn } from '@vueuse/core'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import Backward from '~icons/heroicons/backward'
import LinkSlash from '~icons/heroicons/link-slash'
import IconSearch from '~icons/ic/round-search?raw'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()
const { t } = useI18n()
const versions = ref<Database['public']['Tables']['app_versions']['Row'][]>([])
const supabase = useSupabase()
const searchVal = ref('')
const open = ref(false)

const { showBundleLinkDialogChannel } = storeToRefs(displayStore)

watch(showBundleLinkDialogChannel, async () => {
  const { data, error } = await supabase.from('app_versions')
    .select('*')
    .eq('app_id', showBundleLinkDialogChannel.value!.app_id)
    .eq('deleted', false)
    .neq('id', (showBundleLinkDialogChannel.value!.version as any).id)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) {
    console.error(error)
    toast.error(t('error-fetching-versions'))
  }
  versions.value = data ?? []
  open.value = true
})

const debouncedRefreshfilteredVersions = useDebounceFn(() => {
  refreshfilteredVersions()
}, 500)

watch(searchVal, () => {
  debouncedRefreshfilteredVersions()
})

async function refreshfilteredVersions() {
  if (searchVal.value) {
    const { data, error } = await supabase.from('app_versions')
      .select('*')
      .eq('app_id', showBundleLinkDialogChannel.value!.app_id)
      .eq('deleted', false)
      .neq('id', (showBundleLinkDialogChannel.value!.version as any).id)
      .order('created_at', { ascending: false })
      .like('name', `%${searchVal.value}%`)
    if (error) {
      console.error(error)
      toast.error(t('error-fetching-versions'))
    }
    versions.value = data ?? []
  }
  else {
    const { data, error } = await supabase.from('app_versions')
      .select('*')
      .eq('app_id', showBundleLinkDialogChannel.value!.app_id)
      .eq('deleted', false)
      .neq('id', (showBundleLinkDialogChannel.value!.version as any).id)
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) {
      console.error(error)
      toast.error(t('error-fetching-versions'))
    }
    versions.value = data ?? []
  }
}
</script>

<template>
  <div>
    <dialog id="my_modal_1" class="modal" :open="open">
      <div class="bg-white modal-box dark:bg-base-100 max-h-[80vh]" :class="displayStore.dialogOption?.size ?? ''">
        <div class="absolute flex flex-col right-2 top-2">
          <button class="ml-auto btn btn-sm btn-circle btn-ghost" @click="() => { open = false; displayStore.showBundleLinkDialogChannel = null }">
            ✕
          </button>
        </div>
        <h3 class="text-lg font-bold text-center" :class="displayStore.dialogOption?.headerStyle">
          {{ t('bundle-link-dialog-header') }}
        </h3>
        <div class="mt-8">
          <FormKit
            v-model="searchVal"
            :prefix-icon="IconSearch"
            enterkeyhint="send"
            :classes="{
              outer: 'mb-0! w-full',
              inner: 'rounded-full!',
            }"
          />
        </div>
        <div class="modal-action">
          <div
            class="flex flex-col items-center w-full rounded-b dark:border-gray-600"
          >
            <div v-for="version in versions" :key="version.id" class="w-full px-8 h-11" @click="async () => { await (displayStore.showBundleLinkDialogCallbacks.onLink as any)(version); open = false }">
              <div
                class="flex items-center justify-center h-full text-center dark:hover:bg-gray-400 hover:bg-gray-200" :class="{
                  'dark:bg-gray-700 bg-gray-400 cursor-not-allowed': showBundleLinkDialogChannel && (showBundleLinkDialogChannel?.version as any).id === version.id,
                }"
              >
                {{ version.name }}
              </div>
            </div>
            <div v-if="searchVal === ''" class="w-full px-8 h-11">
              <div class="relative flex items-center justify-center h-full text-center dark:hover:bg-gray-400 hover:bg-gray-200" @click="async () => { await displayStore.showBundleLinkDialogCallbacks.onUnlink(); open = false }">
                <span>{{ t('unlink-bundle') }}</span>
                <LinkSlash class="absolute left-[calc(50%-80px)] w-6 h-6 text-[#3B82F6]" />
              </div>
            </div>
            <div v-if="searchVal === ''" class="w-full px-8 h-11" @click="async () => { await displayStore.showBundleLinkDialogCallbacks.onRevert(); open = false }">
              <div class="relative flex items-center justify-center h-full text-center dark:hover:bg-gray-400 hover:bg-gray-200">
                <span>{{ t('revert-to-builtin') }}</span>
                <Backward class="absolute left-[calc(50%-90px)] w-6 h-6 text-[#3B82F6]" />
              </div>
            </div>
            <!-- if there is a button in form, it will close the modal -->
            <!-- <button
              v-for="(item, i) in displayStore.dialogOption?.buttons"
              :key="i"
              :class="{
                'btn btn-warning text-white': item.role === 'danger',
                'text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-hidden focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800': item.role !== 'cancel' && item.role !== 'danger',
                'text-gray-500 bg-white hover:bg-gray-100 focus:ring-4 focus:outline-hidden focus:ring-blue-300 border border-gray-200 hover:text-gray-900 focus:z-10 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500 dark:hover:text-white dark:hover:bg-gray-600 dark:focus:ring-gray-600': item.role === 'cancel',
                'ml-auto mr-2': displayStore.dialogOption?.buttonCenter && i === 0 && (displayStore.dialogOption?.buttons?.length ?? 0) > 1,
                'mr-auto ml-2': displayStore.dialogOption?.buttonCenter && i === (displayStore.dialogOption?.buttons?.length ?? 0) - 1 && (displayStore.dialogOption?.buttons?.length ?? 0) > 1,
                'mx-auto': displayStore.dialogOption?.buttonCenter && (displayStore.dialogOption?.buttons?.length ?? 0) === 1,
                'my-1 mx-auto!': displayStore.dialogOption?.buttonVertical && item.role !== 'cancel',
                'my-4 mx-auto!': displayStore.dialogOption?.buttonVertical && item.role === 'cancel',
              }"
              class="btn rounded-lg px-5 py-2.5 text-center text-sm font-mediumtext-whitefocus:outline-none focus:ring-4"
              @click="displayStore.showBundleLinkDialog = false"
            >
              {{ item.text }}
            </button> -->
          </div>
        </div>
      </div>
    </dialog>
    <div v-if="open" class="fixed inset-0 z-40 bg-black/50" @click="open = false" />
  </div>
</template>
