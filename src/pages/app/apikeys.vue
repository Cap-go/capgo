<script setup lang="ts">
import { kBlockTitle, kListItem } from 'konsta/vue'

import { ref, watchEffect } from 'vue'
import copy from 'copy-text-to-clipboard'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import TitleHead from '~/components/TitleHead.vue'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const isLoading = ref(false)
const route = useRoute()
const main = useMainStore()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const apps = ref<Database['public']['Tables']['apikeys']['Row'][]>()
const copyKey = async (app: Database['public']['Tables']['apikeys']['Row']) => {
  copy(app.key)
  displayStore.messageToast.push(t('apikeys.keyCopied'))
}
const geKeys = async (retry = true): Promise<void> => {
  isLoading.value = true
  const { data } = await supabase
    .from('apikeys')
    .select()
    .eq('user_id', main.user?.id)
  if (data && data.length)
    apps.value = data

  else if (retry && main.user?.id)
    return geKeys(false)

  isLoading.value = false
}
watchEffect(async () => {
  if (route.path === '/app/apikeys')
    await geKeys()
})
</script>

<template>
  <TitleHead :title="t('apikeys.title')" default-back="/app/account" />
  <div class="w-full mx-auto lg:w-1/2">
    <div class="px-6 py-16">
      <p class="m-3">
        {{ t('apikeys.explain') }}
      </p>
      <p class="m-3">
        {{ t('apikeys.checkbelow') }}
      </p>
      <k-block-title>{{ t('apikeys.links') }}</k-block-title>
      <k-list strong-ios outline-ios>
        <k-list-item
          link :title="t('apikeys.cli')"
          target="_blank" rel="noopener noreferrer"
          href="https://www.npmjs.com/package/@capgo/cli"
        />
        <k-list-item
          link :title="t('apikeys.updater')"
          target="_blank" rel="noopener noreferrer"
          href="https://www.npmjs.com/package/@capgo/capacitor-updater"
        />
      </k-list>
      <k-block-title>{{ t('apikeys.all') }}</k-block-title>
      <k-block v-if="isLoading" strong inset-material outline-ios class="text-center">
        <k-preloader />
      </k-block>
      <k-list v-else strong-ios outline-ios>
        <k-list-item
          v-for="(app, index) in apps" :key="index" :title="app.key" :after="app.mode"
          @click="copyKey(app)"
        />
      </k-list>
    </div>
  </div>
</template>
