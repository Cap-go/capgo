<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { FormKitMessages } from '@formkit/vue'
import { isSpoofed, saveSpoof, spoofUser, unspoofUser } from '~/services/supabase'

const route = useRoute()
const isLoading = ref(false)
const oldId = ref(isSpoofed())

const setLogAs = (id: string) => {
  console.log('setLogAs', id)
  saveSpoof(id)
  if (!spoofUser()) {
    isLoading.value = false
    return
  }
  // reload page
  setTimeout(() => {
    isLoading.value = false
    window.location.reload()
  }, 1000)
}
const submit = async (form: { uuid: string }) => {
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
const reset = () => {
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
    <FormKit id="set-password" messages-class="text-red-500" type="form" :actions="false" @submit="submit">
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

          <div class="mt-5 sm:flex sm:items-center space-y-4 sm:space-x-4 sm:space-y-0">
            <div class="sm:w-1/2">
              <label class="mb-1 block text-sm font-medium dark:text-white" for="name">UUID</label>
              <FormKit
                type="text"
                name="uuid"
                :disabled="isLoading"
                enterkeyhint="send"
                autofocus
                validation="required:trim"
                placeholder="UUID"
                input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
                message-class="text-red-500"
              />
            </div>
          </div>
        </section>
        <FormKitMessages />
      </div>
      <!-- Panel footer -->
      <footer>
        <div class="flex flex-col border-t border-slate-200 px-6 py-5">
          <div class="flex self-end">
            <button
              class="btn ml-3 rounded bg-blue-500 p-2 text-white hover:bg-blue-600"
              type="submit"
              color="secondary"
              shape="round"
            >
              <span v-if="!isLoading" class="rounded-4xl">
                Spoof
              </span>
              <Spinner v-else size="w-4 h-4" class="px-4" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
            </button>
            <button
              v-if="oldId"
              class="btn ml-3 rounded bg-red-500 p-2 text-white hover:bg-red-600"
              color="secondary"
              shape="round"
              @click="reset()"
            >
              <span v-if="!isLoading" class="rounded-4xl">
                Reset
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
