<script setup lang="ts">
import { alertController, toastController } from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import IconTrash from '~icons/heroicons/trash'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'

const props = defineProps<{
  app: Database['public']['Tables']['apps']['Row']
  channel: string
}>()
const emit = defineEmits(['reload'])
const route = useRoute()
const router = useRouter()
const supabase = useSupabase()

const isLoading = ref(true)
const devicesNb = ref(0)
const { t } = useI18n()

const didCancel = async (name: string) => {
  const alert = await alertController
    .create({
      header: t('alert.confirm-delete'),
      message: `${t('alert.not-reverse-message')} ${t('alert.delete-message')} ${name}?`,
      buttons: [
        {
          text: t('button.cancel'),
          role: 'cancel',
        },
        {
          text: t('button.delete'),
          id: 'confirm-button',
        },
      ],
    })
  await alert.present()
  return alert.onDidDismiss().then(d => (d.role === 'cancel'))
}

const deleteApp = async (app: Database['public']['Tables']['apps']['Row']) => {
  // console.log('deleteApp', app)
  if (await didCancel(t('package.name')))
    return
  try {
    const { data, error: vError } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)

    if (data && data.length) {
      const filesToRemove = (data as Database['public']['Tables']['app_versions']['Row'][]).map(x => `${app.user_id}/${app.app_id}/versions/${x.bucket_id}`)
      const { error: delError } = await supabase
        .storage
        .from('apps')
        .remove(filesToRemove)
      if (delError) {
        const toast = await toastController
          .create({
            message: t('cannot-delete-app-version'),
            duration: 2000,
          })
        await toast.present()
        return
      }
    }

    const { error: dbAppError } = await supabase
      .from('apps')
      .delete()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)
    if (vError || dbAppError) {
      const toast = await toastController
        .create({
          message: t('cannot-delete-app'),
          duration: 2000,
        })
      await toast.present()
    }
    else {
      const toast = await toastController
        .create({
          message: 'App deleted',
          duration: 2000,
        })
      await toast.present()
      await emit('reload')
    }
  }
  catch (error) {
    const toast = await toastController
      .create({
        message: t('cannot-delete-app'),
        duration: 2000,
      })
    await toast.present()
  }
}

const loadData = async () => {
  if (!props.channel) {
    try {
      const date_id = new Date().toISOString().slice(0, 7)
      const { data, error } = await supabase
        .from('app_stats')
        .select()
        .eq('app_id', props.app.app_id)
        .eq('date_id', date_id)
        .single()
      if (!data || error)
        return
      devicesNb.value = data?.devices
    }
    catch (error) {
      console.error(error)
    }
  }
}

const refreshData = async () => {
  isLoading.value = true
  try {
    devicesNb.value = 0
    await loadData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

const openPackage = (appId: string) => {
  router.push(`/app/package/${appId.replace(/\./g, '--')}`)
}

watchEffect(async () => {
  if (route.path.endsWith('/app/home'))
    await refreshData()
})
</script>

<template>
  <!-- Row -->
  <tr class="cursor-pointer text-slate-800 dark:text-white" @click="openPackage(app.app_id)">
    <td class="p-2">
      <div class="flex flex-wrap items-center">
        <img :src="app.icon_url" :alt="`App icon ${app.name}`" class="mr-2 shrink-0 sm:mr-3" width="36" height="36">
        <div class="max-w-max">
          {{ props.app.name }}
        </div>
      </div>
    </td>
    <td class="p-2">
      <div class="text-center">
        {{ props.app.last_version }}
      </div>
    </td>
    <td class="p-2">
      <div class="text-center">
        {{ formatDate(props.app.updated_at || "") }}
      </div>
    </td>
    <td class="p-2">
      <div v-if="!isLoading && !props.channel" class="text-center">
        {{ devicesNb }}
      </div>
      <div v-else class="text-center">
        {{ props.channel }}
      </div>
    </td>
    <td v-if="!channel" class="p-2" @click.stop="deleteApp(app)">
      <div class="text-center">
        <IconTrash />
      </div>
    </td>
  </tr>
</template>

<style>
  #confirm-button {
    background-color: theme('colors.red.500');
    color: theme('colors.white');
  }
</style>
