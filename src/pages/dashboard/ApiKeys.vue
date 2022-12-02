<script setup lang="ts">
import { toastController } from '@ionic/vue'
// import { IonIcon, toastController } from '@ionic/vue'
import { ref } from 'vue'
import copy from 'copy-text-to-clipboard'
import { useI18n } from 'vue-i18n'
// import { addOutline } from 'ionicons/icons'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Sidebar from '~/components/Sidebar.vue'
import Navbar from '~/components/Navbar.vue'

const { t } = useI18n()
const isLoading = ref(false)
const sidebarOpen = ref(false)
const supabase = useSupabase()
const auth = supabase.auth.user()
const apps = ref<definitions['apikeys'][]>()
const copyKey = async (app: definitions['apikeys']) => {
  copy(app.key)
  const toast = await toastController
    .create({
      message: t('apikeys.keyCopied'),
      duration: 2000,
    })
  await toast.present()
}
const geKeys = async (retry = true): Promise<void> => {
  isLoading.value = true
  const { data } = await supabase
    .from<definitions['apikeys']>('apikeys')
    .select()
    .eq('user_id', auth?.id)
  if (data && data.length)
    apps.value = data

  else if (retry && auth?.id)
    return geKeys(false)

  isLoading.value = false
}
geKeys()
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
              {{ t('api-keys') }} 🔑
            </h1>
          </div>

          <!-- Content -->
          <div class="mb-8 bg-white rounded-sm shadow-lg dark:bg-gray-800 dark:text-white">
            <div class="flex flex-col md:flex-row md:-mr-px">
              <div class="grow">
                <!-- Panel body -->
                <div class="p-6 space-y-6">
                  <!-- API Keys -->
                  <section>
                    <div v-for="app in apps" :key="app.id" class="mb-2 space-y-2 cursor-pointer" @click="copyKey(app)">
                      <div>
                        <label class="block mb-1 text-lg font-medium" for="location">{{ app.mode.toUpperCase() }} :</label>
                        <p class="font-bold">
                          {{ app.key }}
                        </p>
                      </div>
                      <hr class="border-muted-blue-600 dark:border-white">
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
  <!-- <button
    class="fixed flex items-center justify-center w-16 h-16 text-3xl text-white bg-blue-600 rounded-full z-90 bottom-10 right-8 drop-shadow-lg hover:bg-muted-blue-700 hover:drop-shadow-2xl focus:border-muted-blue-100 focus:border-2"
  >
    <IonIcon :icon="addOutline" />
  </button> -->
</template>
