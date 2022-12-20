<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  IonSpinner,
} from '@ionic/vue'
import useVuelidate from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useRoute } from 'vue-router'
import Sidebar from '../../../components/Sidebar.vue'
import Navbar from '../../../components/Navbar.vue'
import SettingsSidebar from '../../../components/settings/SettingsSidebar.vue'
import { isSpoofed, saveSpoof, spoofUser, unspoofUser } from '~/services/supabase'

const route = useRoute()
const form = reactive({
  uuid: '',
})
const isLoading = ref(false)
const oldId = ref(isSpoofed())
const sidebarOpen = ref(false)
const rules = computed(() => ({
  uuid: { required },
}))

const v$ = useVuelidate(rules, form)
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
const submit = async () => {
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect)
    isLoading.value = false
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
  <div class="flex h-screen overflow-hidden bg-white safe-zone dark:bg-gray-900/90">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />

    <!-- Content area -->
    <div class="relative flex flex-col flex-1 overflow-x-hidden overflow-y-auto">
      <!-- Site header -->
      <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main>
        <div class="w-full px-4 py-8 mx-auto sm:px-6 lg:px-8 max-w-9xl">
          <!-- Page header -->
          <div class="mb-8">
            <!-- Title -->
            <h1 class="text-2xl font-bold md:text-3xl text-slate-800 dark:text-white">
              Admin
            </h1>
          </div>

          <!-- Content -->
          <div class="mb-8 bg-white rounded-sm shadow-lg dark:bg-gray-800">
            <div class="flex flex-col md:flex-row md:-mr-px">
              <SettingsSidebar />
              <div>
                <div class="grow">
                  <form
                    @submit.prevent="submit"
                  >
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

                        <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-y-0 sm:space-x-4">
                          <div class="sm:w-1/2">
                            <label class="block mb-1 text-sm font-medium dark:text-white" for="name">UUID</label>
                            <input
                              v-model="form.uuid" class="w-full form-input dark:bg-gray-700 dark:text-white"
                              :disabled="isLoading"
                              autofocus
                              required
                              placeholder="UUID"
                              type="text"
                            >
                            <div v-for="(error, index) of v$.uuid.$errors" :key="index">
                              <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
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
                            class="p-2 ml-3 text-white bg-blue-500 rounded btn hover:bg-blue-600"
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
                            class="p-2 ml-3 text-white bg-red-500 rounded btn hover:bg-red-600"
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
