<script setup lang="ts">
import { toast } from 'vue-sonner'
import { useSupabase } from '~/services/supabase'
import { urlToAppId } from '~/services/conversion'
import type { Database } from '~/types/supabase.types'

const route = useRoute()
const supabase = useSupabase()
const appId = ref('')
const appRef = ref<Database['public']['Tables']['apps']['Row'] & { owner_org: Database['public']['Tables']['orgs']['Row'] } | null>(null)
const { t } = useI18n()
const displayStore = useDisplayStore()

watchEffect(async () => {
  if (route.path.includes('/p/')) {
    appId.value = (route.params as any).p as string
    appId.value = urlToAppId(appId.value)

    const { error, data } = await supabase
      .from('apps')
      .select('*, owner_org ( name )')
      .eq('app_id', appId.value)
      .single()

    if (error) {
      toast.error(t('cannot-load-app-settings'))
      return
    }

    appRef.value = data as any
  }
})

const acronym = computed(() => {
  const words = appRef.value?.name?.split(' ') || []
  let res = appRef.value?.name?.slice(0, 2) || 'AP'
  if (words?.length > 2)
    res = words[0][0] + words[1][0]
  else if (words?.length > 1)
    res = words[0][0] + words[1][0]
  return res.toUpperCase()
})

async function editName() {
  displayStore.dialogOption = {
    header: t('type-new-app-name'),
    message: `${t('please-type-new-app-name')}`,
    input: true,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    size: 'max-w-sm',
    buttonCenter: true,
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('verify'),
        id: 'verify',
        preventClose: true,
        handler: async () => {},
      },
    ],
  }

  displayStore.dialogInputText = appRef?.value?.name ?? ''
  displayStore.showDialog = true
}
</script>

<template>
  <div v-if="!displayStore.showDialog" class="flex justify-center flex-col items-center pb-80">
    <div class="flex justify-center flex-col items-center border-3 border-gray-700 p-5 rounded-xl">
      <p class="text-6xl">
        {{ appRef?.name }}
      </p>
      <img v-if="appRef?.icon_url" :src="appRef.icon_url" :alt="`App icon ${appRef.name}`" class="mr-2 rounded shrink-0 mx-auto" width="36" height="36">
      <div v-else class="mt-8 flex items-center justify-center w-16 h-16 border border-black rounded-lg dark:border-white mx-auto">
        <p class="text-xl">
          {{ acronym }}
        </p>
      </div>
      <p class="mt-8 mx-auto">
        {{ t('app-id') }} {{ appRef?.app_id }}
      </p>
      <p class="mt-2 mx-auto">
        {{ t('owner-org') }} {{ appRef?.owner_org.name }}
      </p>
      <div class="flex flex-row mt-8 ">
        <button class="mr-2 px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-grey focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800" @click="editName">
          {{ t('edit-name') }}
        </button>
        <button class="ml-2 px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-grey focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800">
          {{ t('edit-pic') }}
        </button>
      </div>
    </div>
  </div>
</template>
