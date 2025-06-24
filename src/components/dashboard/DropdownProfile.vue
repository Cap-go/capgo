<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { isSpoofed, saveSpoof, unspoofUser, useSupabase } from '~/services/supabase'
import { openSupport } from '~/services/support'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const router = useRouter()
const main = useMainStore()
const dialogStore = useDialogV2Store()
const isMobile = ref(Capacitor.isNativePlatform())
const acronym = computed(() => {
  let res = 'MD'
  if (main.user?.first_name && main.user?.last_name)
    res = main.user?.first_name[0] + main.user?.last_name[0]
  else if (main.user?.first_name)
    res = main.user?.first_name[0]
  else if (main.user?.last_name)
    res = main.user?.last_name[0]
  return res.toUpperCase()
})
const isLoading = ref(false)
const logAsInput = ref('')

async function openLogAsDialog() {
  let userId = ''
  logAsInput.value = ''

  dialogStore.openDialog({
    title: t('log-as'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('log-as'),
        handler: () => {
          userId = logAsInput.value
        },
      },
    ],
  })
  await dialogStore.onDialogDismiss()

  if (userId) {
    isLoading.value = true
    await setLogAs(userId)
    isLoading.value = false
  }
}

async function setLogAs(id: string) {
  if (isSpoofed())
    unspoofUser()

  const supabase = await useSupabase()
  const { data, error } = await supabase.functions.invoke('private/log_as', {
    body: { user_id: id },
  })

  if (error) {
    toast.error('Cannot log in, see console')
    console.error(error)
    return
  }

  const { jwt: newJwt, refreshToken: newRefreshToken } = data

  if (!newJwt || !newRefreshToken) {
    toast.error('Cannot log in, see console')
    console.error('No data or token?', data)
    return
  }

  const { data: currentSession, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !currentSession?.session) {
    console.error('No current session', sessionError)
    toast.error('Cannot log in, see console')
    return
  }

  const { access_token: currentJwt, refresh_token: currentRefreshToken } = currentSession.session

  const { error: authError } = await supabase.auth.setSession({ access_token: newJwt, refresh_token: newRefreshToken })
  if (authError) {
    console.error('Auth error', authError)
    toast.error('Cannot log in, see console')
    return
  }

  saveSpoof(currentJwt, currentRefreshToken)
  toast.success('Spoofed, will reload')
  setTimeout(() => {
    window.location.reload()
  }, 1000)
}

function resetSpoofedUser() {
  if (unspoofUser()) {
    toast.error('Stop Spoofed, will reload')
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }
}

async function logOut() {
  dialogStore.openDialog({
    title: t('are-u-sure'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('logout'),
        role: 'danger',
        id: 'confirm-button',
        handler: async () => {
          main.logout().then(() => router.replace('/login'))
        },
      },
    ],
  })
  await dialogStore.onDialogDismiss()
}
</script>

<template>
  <div>
    <div class="relative text-gray-300">
      <div class="flex flex-col p-4 space-y-2">
        <div class="flex items-center mb-4">
          <img v-if="main.user?.image_url" class="w-10 h-10 mr-3 mask mask-squircle" :src="main.user?.image_url" alt="User" width="32" height="32">
          <div v-else class="p-2 mr-3 bg-gray-700 mask mask-squircle">
            <span class="font-medium">
              {{ acronym }}
            </span>
          </div>
          <div class="min-w-0">
            <p class="font-medium truncate">
              {{ `${main.user?.first_name} ${main.user?.last_name}` }}
            </p>
            <p class="text-sm text-gray-400 truncate">
              {{ main.user?.email }}
            </p>
          </div>
        </div>
        <router-link to="/settings/account" class="block px-3 py-2 rounded-lg hover:bg-slate-700/50">
          {{ t('settings') }}
        </router-link>
        <router-link v-if="isMobile" to="/app/modules" class="block px-3 py-2 rounded-lg hover:bg-slate-700/50">
          {{ t('module-heading') }}
        </router-link>
        <router-link v-if="isMobile" to="/app/modules_test" class="block px-3 py-2 rounded-lg hover:bg-slate-700/50">
          {{ t('module-heading') }} {{ t('tests') }}
        </router-link>
        <div class="block px-3 py-2 rounded-lg hover:bg-slate-700/50" @click="openSupport">
          {{ t('support') }}
        </div>
        <div v-if="main.isAdmin && !isSpoofed()" class="block px-3 py-2 rounded-lg hover:bg-slate-700/50 cursor-pointer" :class="{ 'opacity-50 cursor-not-allowed': isLoading }" @click="openLogAsDialog">
          <span v-if="!isLoading">{{ t('log-as') }}</span>
          <span v-else class="flex items-center">
            <Spinner size="w-4 h-4" class="mr-2" />
            {{ t('loading') }}
          </span>
        </div>
        <div v-if="isSpoofed()" class="block px-3 py-2 rounded-lg hover:bg-slate-700/50" @click="resetSpoofedUser">
          {{ t('reset-spoofed-user') }}
        </div>
        <div class="block px-3 py-2 rounded-lg hover:bg-slate-700/50" @click="logOut">
          {{ t('sign-out') }}
        </div>
      </div>
    </div>

    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('log-as')" to="#dialog-v2-content" defer>
      <div class="w-full">
        <input
          v-model="logAsInput"
          type="text"
          :placeholder="t('user-id')"
          class="w-full p-3 border border-gray-300 rounded-lg dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          @keydown.enter="$event.preventDefault()"
        >
      </div>
    </Teleport>
  </div>
</template>
