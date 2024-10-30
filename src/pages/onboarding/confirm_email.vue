<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import Navbar from '~/components/Navbar.vue'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const route = useRoute('/onboarding/confirm_email')
const supabase = useSupabase()

const email = route.query.email as string
const displayStore = useDisplayStore()
displayStore.defaultBack = '/login'
displayStore.NavTitle = t('activation-heading')
async function resendEmail() {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  })
  if (error)
    toast.error(error.message)

  else
    toast.success(t('confirm-email-sent'))
}
</script>

<template>
  <div>
    <Navbar />
    <div class="h-screen">
      <div class="flex items-center justify-center w-full h-full px-4 py-5 overflow-y-auto sm:p-6">
        <div class="w-full max-w-sm bg-white shadow-lg rounded-xl">
          <div class="px-4 py-5 sm:p-6">
            <div class="text-center">
              <svg class="w-16 h-16 mx-auto text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p class="mt-5 text-xl font-bold text-gray-900">
                {{ t('confirm-email') }}
              </p>
              <p class="mt-3 text-sm font-medium text-gray-500">
                {{ t('check-email') }}
              </p>
              <div class="flex justify-center gap-2">
                <p class="text-sm font-medium text-gray-500">
                  {{ t('did-not-recive-confirm-email') }}
                </p>
                <p
                  to="/resend_email"
                  class="text-sm font-medium text-blue-600 transition-all duration-200 cursor-pointer hover:text-blue-500 hover:underline"
                  @click="resendEmail"
                >
                  {{ t('resend') }}
                </p>
              </div>
              <div class="mt-8">
                <span
                  class="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold leading-5 text-blue-600 transition-all duration-200 rounded-md"
                >
                  {{ t('thank-you-for-choosi') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
