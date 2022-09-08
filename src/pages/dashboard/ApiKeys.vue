<script setup lang="ts">
import { toastController } from '@ionic/vue'
import { ref } from 'vue'
import copy from 'copy-text-to-clipboard'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Sidebar from '~/partials/Sidebar.vue'
import Navbar from '~/partials/Navbar.vue'

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
  <div class="flex h-screen overflow-hidden bg-white">
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
            <h1 class="text-2xl md:text-3xl text-slate-800 font-bold">
              API Keys 🔑
            </h1>
          </div>

          <!-- Content -->
          <div class="bg-white shadow-lg rounded-sm mb-8">
            <div class="flex flex-col md:flex-row md:-mr-px">
              <div class="grow">
                <!-- Panel body -->
                <div class="p-6 space-y-6">
                  <!-- API Keys -->
                  <section>
                    <div v-for="app in apps" :key="app.id" class="cursor-pointer space-y-2 mb-2" @click="copyKey(app)">
                      <div>
                        <label class="block text-lg font-medium mb-1" for="location">{{ app.mode.toUpperCase() }} :</label>
                        <p class="font-bold">
                          {{ app.key }}
                        </p>
                      </div>
                      <hr class="border-muted-blue-600">
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
</template>
