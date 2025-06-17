<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref } from 'vue'
import Toggle from '~/components/Toggle.vue'
import { useSupabase } from '~/services/supabase'

const { t } = useI18n()
const route = useRoute('/invitation')
const router = useRouter()

// Form data
const password = ref('')
const inviteMagicString = ref('')
const inviteRow = ref<Database['public']['Functions']['get_invite_by_magic_lookup']['Returns'][0] | null>(null)
const isLoading = ref(true)
const isError = ref(null) as Ref<string | null>
const supabase = useSupabase()

// Terms and marketing acceptance
const acceptTerms = ref(false)
const acceptMarketing = ref(false)
const showTermsError = ref(false)

// Password validation
const hasMinLength = computed(() => password.value.length >= 12)
const hasUppercase = computed(() => /[A-Z]/.test(password.value))
const hasNumber = computed(() => /\d/.test(password.value))
const hasSymbols = computed(() => {
  // Improved regex to match special characters
  // Count each special character individually
  let symbolCount = 0
  const specialChars = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/g
  const matches = password.value.match(specialChars)

  // Return the count of matches, or 0 if no matches
  symbolCount = matches ? matches.length : 0

  return symbolCount >= 2
})

const isPasswordValid = computed(() =>
  hasMinLength.value
  && hasUppercase.value
  && hasNumber.value
  && hasSymbols.value,
)

onMounted(async () => {
  const supabase = useSupabase()
  if (route.query.invite_magic_string) {
    inviteMagicString.value = route.query.invite_magic_string as string
    const { data, error } = await supabase.rpc('get_invite_by_magic_lookup', {
      lookup: inviteMagicString.value,
    }).single()

    if (error) {
      console.error('Error fetching invite:', error)
      isError.value = error.message
      isLoading.value = false
    }
    else {
      inviteRow.value = data
      isLoading.value = false
    }
  }
  else {
    isLoading.value = false
  }

  const { data: auth } = await supabase.auth.getUser()
  if (auth.user) {
    await supabase.auth.signOut()
  }
})

// Submit function
async function submitForm() {
  if (!isPasswordValid.value)
    return

  // Check if terms are accepted
  if (!acceptTerms.value) {
    showTermsError.value = true
    return
  }

  showTermsError.value = false

  try {
    // Show loading indicator
    isLoading.value = true

    // Call the backend API to accept the invitation using Supabase Functions
    const { data, error } = await supabase.functions.invoke('private/accept_invitation', {
      body: {
        password: password.value,
        magic_invite_string: inviteMagicString.value,
        optForNewsletters: acceptMarketing.value,
      },
    })

    if (error) {
      throw new Error(error.message || 'Failed to accept invitation')
    }

    // Store tokens in local storage or cookies
    if (data?.access_token && data?.refresh_token) {
      // Login successful, redirect to dashboard
      // window.location.href = '/dashboard';
      router.push(`/login?access_token=${data.access_token}&refresh_token=${data.refresh_token}`)

      // MagicCapgo12@#
    }
    else {
      throw new Error('No tokens received from server')
    }
  }
  catch (error: unknown) {
    console.error('Error accepting invitation:', error)
    isError.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    isLoading.value = false
  }
}

function joinCapgo() {
  window.location.href = 'https://capgo.app/register/'
}

// Open ToS and Privacy Policy in new tabs
function openTos() {
  window.open('https://capgo.app/tos/', '_blank')
}

function openPrivacy() {
  window.open('https://capgo.app/privacy/', '_blank')
}
</script>

<template>
  <section class="flex w-full h-full py-10 overflow-y-auto lg:py-2 sm:py-8">
    <div class="px-4 mx-auto max-w-7xl lg:px-8 sm:px-6" style="margin-top: 5vh;">
      <div class="max-w-2xl mx-auto text-center">
        <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded-sm invert dark:invert-0">
        <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
          {{ t('welcome-to') }}
          <p class="inline font-prompt">
            Capgo
          </p> !
        </h1>
        <template v-if="!isLoading && inviteRow">
          <p class="max-w-xl mx-auto mt-6 text-base leading-relaxed text-gray-600 dark:text-gray-300">
            {{ t('invitation-page') }}
          </p>
          <p class="max-w-xl mx-auto mt-2 text-base leading-relaxed text-gray-600 dark:text-gray-300">
            {{ t('invitation-page-description') }}
          </p>
        </template>
      </div>
      <div v-if="!isLoading" class="relative max-w-md mx-auto mt-8 md:mt-4 pb-[10vh]">
        <div v-if="inviteRow">
          <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
            <div class="px-4 py-6 text-gray-500 sm:px-8 sm:py-7">
              <div class="space-y-5">
                <!-- Organization Section -->
                <div class="mb-6">
                  <h2 class="mb-3 text-lg font-medium text-center text-gray-700 dark:text-gray-300">
                    Organization
                  </h2>
                  <div class="flex flex-col items-center mb-4">
                    <img v-if="inviteRow.org_logo" :src="inviteRow.org_logo" alt="organization logo" class="w-16 h-16 mb-2 rounded-sm">
                    <div v-else class="p-6 mb-3 text-xl bg-gray-700 mask mask-squircle">
                      <span class="font-medium text-gray-300">
                        N/A
                      </span>
                    </div>
                    <p class="font-medium text-gray-800 dark:text-gray-200">
                      {{ t('organization-name') }}: {{ inviteRow.org_name }}
                    </p>
                    <p class="text-gray-600 dark:text-gray-400">
                      {{ t('your-role-in-org') }}: {{ inviteRow.role.replace('_', ' ') }}
                    </p>
                  </div>
                </div>

                <!-- Separator -->
                <div class="w-full h-px bg-gray-300 dark:bg-gray-600" />

                <!-- Login Details Section -->
                <div class="mb-6">
                  <h2 class="mb-3 text-lg font-medium text-center text-gray-700 dark:text-gray-300">
                    Your login details
                  </h2>

                  <div class="mb-4">
                    <label class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Password:</label>
                    <input
                      v-model="password"
                      type="password"
                      placeholder="Enter your password"
                      autocomplete="new-password"
                      class="w-full px-3 py-2 text-gray-700 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
                    >

                    <!-- Password requirements section -->
                    <div class="mt-3 p-4 bg-gray-100 dark:bg-gray-700 rounded-md">
                      <h3 class="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                        Password Requirements:
                      </h3>
                      <ul class="space-y-2 text-sm">
                        <li class="flex items-center" :class="hasMinLength ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                          <span class="mr-2">{{ hasMinLength ? '✓' : '✗' }}</span>
                          {{ t('at-least-12-characters') }}
                        </li>
                        <li class="flex items-center" :class="hasUppercase ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                          <span class="mr-2">{{ hasUppercase ? '✓' : '✗' }}</span>
                          {{ t('at-least-one-uppercase-letter') }}
                        </li>
                        <li class="flex items-center" :class="hasNumber ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                          <span class="mr-2">{{ hasNumber ? '✓' : '✗' }}</span>
                          {{ t('at-least-one-number') }}
                        </li>
                        <li class="flex items-center" :class="hasSymbols ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                          <span class="mr-2">{{ hasSymbols ? '✓' : '✗' }}</span>
                          {{ t('at-least-two-special-characters') }}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <!-- Terms and Conditions Section -->
                <div class="mb-4">
                  <div class="flex items-center mb-4">
                    <Toggle :value="acceptTerms" class="mr-2" @update:value="acceptTerms = !acceptTerms" />
                    <span class="text-sm text-gray-700 dark:text-gray-300">
                      {{ t('accept-terms-of-service-and-privacy-policy') }}
                      <a class="text-blue-600 hover:underline cursor-pointer" @click="openTos">{{ t('terms-of-service') }}</a>
                      {{ t('and') }}
                      <a class="text-blue-600 hover:underline cursor-pointer" @click="openPrivacy">{{ t('privacy-policy') }}</a>
                    </span>
                  </div>
                </div>

                <!-- Marketing Consent Section -->
                <div class="mb-6">
                  <div class="flex items-center">
                    <Toggle :value="acceptMarketing" class="mr-2" @update:value="acceptMarketing = !acceptMarketing" />
                    <span class="text-sm text-gray-700 dark:text-gray-300">
                      {{ t('accept-email-newsletter-and-future-marketing-offers') }}
                    </span>
                  </div>
                </div>

                <!-- Submit Button -->
                <button
                  :disabled="!isPasswordValid || !acceptTerms"
                  class="w-full px-4 py-3 text-base font-semibold text-white transition-all duration-200 rounded-md focus:outline-none"
                  :class="isPasswordValid && acceptTerms ? 'bg-muted-blue-700 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'"
                  @click="submitForm"
                >
                  {{ t('accept-invitation') }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else>
          <div class="flex flex-col items-center justify-center h-full mt-12">
            <p class="text-xl text-center">
              {{ t('invitation-page-not-found') }}
            </p>
            <p class="text-md mt-2 text-center">
              {{ t('you-can-still-join-capgo') }}
            </p>
            <p v-if="isError" class="text-md mt-2 text-center">
              {{ t('error-message-invitation') }}: {{ isError }}
            </p>
            <button class="w-full px-4 py-3 mt-12 text-base font-semibold text-white transition-all duration-200 rounded-md bg-blue-700 hover:scale-105 focus:outline-none" @click="joinCapgo">
              {{ t('join-capgo') }}
            </button>
          </div>
        </div>
      </div>
      <div v-else>
        <div class="flex items-center justify-center h-full mt-12">
          <Spinner size="w-40 h-40" />
        </div>
      </div>
    </div>
  </section>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
