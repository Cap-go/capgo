<script setup lang="ts">
import { FormKit, FormKitMessages } from '@formkit/vue'
import iconPassword from '~icons/ph/key?raw'
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import { isSpoofed, saveSpoof, unspoofUser, useSupabase } from '~/services/supabase'

const route = useRoute()
const isLoading = ref(false)
const oldId = ref(isSpoofed())

async function setLogAs(id: string) {
  console.log('setLogAs', id)

  if (isSpoofed())
    unspoofUser()

  const supabase = await useSupabase()
  const { data, error } = await supabase.functions.invoke('private/log_as', {
    body: {
      user_id: id,
    },
  })

  if (error) {
    toast.error('cannot log in, see console')
    isLoading.value = false
    console.error(error)
    return
  }

  const newJwt = data.jwt
  const newRereshToken = data.refreshToken

  if (!data || !newJwt || !newRereshToken) {
    toast.error('cannot log in, see console')
    isLoading.value = false
    console.error('no data or token?', data)
    return
  }

  const { data: currentSession, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !currentSession || !currentSession.session) {
    console.error('no current session', sessionError)
    isLoading.value = false
    toast.error('cannot log in, see console')
    return
  }

  const currentJwt = currentSession.session.access_token
  const currentRefreshToken = currentSession.session.refresh_token

  const { error: authError } = await supabase.auth.setSession({ access_token: newJwt, refresh_token: newRereshToken })
  if (authError) {
    isLoading.value = false
    console.error('Auth error', authError)
    toast.error('cannot log in, see console')
    return
  }

  saveSpoof(currentJwt, currentRefreshToken)

  console.log('ok')

  isLoading.value = false
  setTimeout(() => {
    isLoading.value = false
    window.location.reload()
  }, 1000)
}
async function submit(form: { uuid: string }) {
  if (isLoading.value)
    return
  isLoading.value = true
  setLogAs(form.uuid)
}

if (route.path.includes('/admin')) {
  const id = route.query.uuid as string
  // remove query param
  window.history.pushState({}, document.title, window.location.pathname)
  if (id) {
    isLoading.value = false
    setTimeout(() => {
      setLogAs(id)
    }, 1000)
  }
}
function reset() {
  if (isLoading.value)
    return
  isLoading.value = true

  if (!unspoofUser()) {
    isLoading.value = false
    return
  }
  setTimeout(() => {
    isLoading.value = false
    window.location.reload()
  }, 1000)
}
</script>

<template>
  <div class="grow">
    <FormKit id="set-uuid" type="form" :actions="false" @submit="submit">
      <!-- Panel body -->
      <div class="p-6 space-y-6">
        <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
          Admin
        </h2>
        <!-- Personal Info -->
        <section>
          <h3 class="mb-1 text-xl font-bold leading-snug text-slate-800 dark:text-white">
            Use the UUID of user you want to spoof
          </h3>

          <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-x-4 sm:space-y-0">
            <div class="sm:w-1/2">
              <FormKit
                type="text"
                name="uuid"
                :prefix-icon="iconPassword"
                :disabled="isLoading"
                enterkeyhint="send"
                autofocus
                validation="required:trim"
                label="UUID"
              />
            </div>
          </div>
        </section>
        <FormKitMessages />
      </div>
      <!-- Panel footer -->
      <footer>
        <div class="flex flex-col px-6 py-5 border-t border-slate-200">
          <div class="flex self-end">
            <button
              v-if="oldId"
              class="p-2 text-red-600 border border-red-400 rounded-lg hover:bg-red-600 hover:text-white"
              color="secondary"
              shape="round"
              @click="reset()"
            >
              <span v-if="!isLoading" class="rounded-4xl">
                Reset
              </span>
              <Spinner v-else size="w-4 h-4" class="px-4" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
            </button>
            <button
              class="p-2 text-blue-600 border border-blue-400 rounded-lg hover:bg-blue-600 hover:text-white"
              type="submit"
              color="secondary"
              shape="round"
            >
              <span v-if="!isLoading" class="rounded-4xl">
                Spoof
              </span>
              <Spinner v-else size="w-4 h-4" class="px-4" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
            </button>
          </div>
        </div>
      </footer>
    </FormKit>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  </route>
