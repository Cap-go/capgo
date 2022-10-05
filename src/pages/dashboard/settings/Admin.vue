<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  IonSpinner,
} from '@ionic/vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import Sidebar from '../../../components/Sidebar.vue'
import Navbar from '../../../components/Navbar.vue'
import SettingsSidebar from '../../../components/settings/SettingsSidebar.vue'

const form = reactive({
  uuid: '',
})
const isLoading = ref(false)
const oldId = ref(localStorage.getItem('supabase.old_id'))
const sidebarOpen = ref(false)
const rules = computed(() => ({
  uuid: { required },
}))

const v$ = useVuelidate(rules, form)
const submit = async () => {
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect)
    isLoading.value = false

  // edit localstorage supabase.auth.token JSON to change uuid
  const textData = localStorage.getItem('supabase.auth.token')
  if (!textData) {
    isLoading.value = false
    return
  }
  const data = JSON.parse(textData)
  console.log('data', data)
  localStorage.setItem('supabase.old_id', data.currentSession.user.id)
  data.currentSession.user.id = form.uuid
  localStorage.setItem('supabase.auth.token', JSON.stringify(data))
  // reload page
  setTimeout(() => {
    isLoading.value = false
    window.location.reload()
  }, 1000)
}
const reset = () => {
  isLoading.value = true
  const textData = localStorage.getItem('supabase.auth.token')
  if (!textData) {
    isLoading.value = false
    return
  }
  const data = JSON.parse(textData)
  data.currentSession.user.id = oldId.value
  localStorage.setItem('supabase.auth.token', JSON.stringify(data))
  localStorage.removeItem('supabase.old_id')
  // reload page
  setTimeout(() => {
    isLoading.value = false
    window.location.reload()
  }, 1000)
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-white dark:bg-gray-900/90">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />

    <!-- Content area -->
    <div class="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
      <!-- Site header -->
      <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main>
        <div class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
          <!-- Page header -->
          <div class="mb-8">
            <!-- Title -->
            <h1 class="text-2xl md:text-3xl text-slate-800 font-bold dark:text-white">
              Admin
            </h1>
          </div>

          <!-- Content -->
          <div class="bg-white dark:bg-gray-800 shadow-lg rounded-sm mb-8">
            <div class="flex flex-col md:flex-row md:-mr-px">
              <SettingsSidebar />
              <div>
                <div class="grow">
                  <form
                    @submit.prevent="submit"
                  >
                    <!-- Panel body -->
                    <div class="p-6 space-y-6">
                      <h2 class="text-2xl text-slate-800 dark:text-white font-bold mb-5">
                        Admin
                      </h2>
                      <!-- Personal Info -->
                      <section>
                        <h3 class="text-xl leading-snug text-slate-800 dark:text-white font-bold mb-1">
                          Use the UUID of user you want to spoof
                        </h3>

                        <div class="sm:flex sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 mt-5">
                          <div class="sm:w-1/2">
                            <label class="block text-sm font-medium mb-1 dark:text-white" for="name">UUID</label>
                            <input
                              v-model="form.uuid" class="form-input w-full dark:bg-gray-700 dark:text-white"
                              :disabled="isLoading"
                              autofocus
                              required
                              placeholder="UUID"
                              type="text"
                            >
                            <div v-for="(error, index) of v$.uuid.$errors" :key="index">
                              <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                                UUID: {{ error.$message }}
                              </p>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                    <!-- Panel footer -->
                    <footer>
                      <div class="flex flex-col px-6 py-5 border-t border-slate-200">
                        <div class="flex self-end">
                          <button
                            class="btn p-2 rounded bg-blue-500 hover:bg-blue-600 text-white ml-3"
                            :disabled="isLoading"
                            type="submit"
                            color="secondary"
                            shape="round"
                          >
                            <span v-if="!isLoading" class="rounded-4xl">
                              Spoof
                            </span>
                            <IonSpinner v-else name="crescent" color="light" />
                          </button>
                          <button
                            v-if="oldId"
                            class="btn p-2 rounded bg-red-500 hover:bg-red-600 text-white ml-3"
                            :disabled="isLoading"
                            color="secondary"
                            shape="round"
                            @click="reset()"
                          >
                            <span v-if="!isLoading" class="rounded-4xl">
                              Reset
                            </span>
                            <IonSpinner v-else name="crescent" color="light" />
                          </button>
                        </div>
                      </div>
                    </footer>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
