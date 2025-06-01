<script setup lang="ts">
import { FormKit } from '@formkit/vue'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import VueTurnstile from 'vue-turnstile'
import IconInformation from '~icons/heroicons/information-circle'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

const displayStore = useDisplayStore()
const { t } = useI18n()
const supabase = useSupabase()
const open = ref(false)
const captchaElement = ref<InstanceType<typeof VueTurnstile> | null>(null)
const captchaToken = ref('')
const isSubmitting = ref(false)

// Store the refresh function separately to ensure it doesn't get lost when closing the dialog
const refreshFunction = ref<(() => Promise<void>) | null>(null)

// Form data - using refs directly for better reactivity control
const email = ref('')
const role = ref('')
const firstName = ref('')
const lastName = ref('')
const orgId = ref('')

// Using real captcha key from env
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)

// Check if form is valid (all required fields filled)
const isFormValid = computed(() => {
  return firstName.value.trim() !== ''
    && lastName.value.trim() !== ''
    && captchaToken.value !== ''
})

const { showInviteNewUserWithoutAccountDialog } = storeToRefs(displayStore)

// Debug function to log current state
function logState() {
  console.log('[InviteDialog] Current state:', {
    open: open.value,
    storeValue: displayStore.showInviteNewUserWithoutAccountDialog,
    email: email.value,
    role: role.value,
    orgId: orgId.value,
    firstName: firstName.value,
    lastName: lastName.value,
    hasRefreshFunction: !!refreshFunction.value,
  })
}

// Function to set form data from store
function setFormDataFromStore() {
  const dialogData = displayStore.showInviteNewUserWithoutAccountDialog

  console.log('[InviteDialog] Setting form data from:', dialogData)

  if (dialogData) {
    email.value = dialogData.email || ''

    // Format role by replacing underscores with spaces
    const rawRole = dialogData.role || ''
    role.value = typeof rawRole === 'string' ? rawRole.replace(/_/g, ' ') : ''

    orgId.value = dialogData.orgId || ''

    // Store the refresh function
    if (dialogData.refreshFunction) {
      refreshFunction.value = dialogData.refreshFunction
    }
  }

  logState()
}

// Function to reset all form state
function resetForm() {
  firstName.value = ''
  lastName.value = ''
  captchaToken.value = ''
  isSubmitting.value = false

  // Reset the captcha widget if available
  if (captchaElement.value) {
    captchaElement.value.reset()
  }
}

// Function to close the dialog and clean up state
function closeDialog() {
  open.value = false
  displayStore.showInviteNewUserWithoutAccountDialog = null
  resetForm()

  // Also clear the email and role
  email.value = ''
  role.value = ''
  orgId.value = ''

  // Don't clear refreshFunction here, as we might need it after dialog closes

  logState()
}

// Watch for store changes
watch(showInviteNewUserWithoutAccountDialog, (newValue) => {
  console.log('[InviteDialog] Dialog state changed:', newValue)

  // If opening the dialog
  if (newValue) {
    console.log('[InviteDialog] Opening dialog with:', {
      email: newValue.email,
      role: newValue.role,
      orgId: newValue.orgId,
      hasRefreshFunction: !!newValue.refreshFunction,
    })

    // Reset form first
    resetForm()

    // Set data from store
    setFormDataFromStore()

    // Then open the dialog
    open.value = true

    // Log state after opening
    setTimeout(logState, 100)
  }
  // If closing the dialog
  else if (!newValue && open.value) {
    closeDialog()
  }
}, { immediate: true, deep: true })

// Also watch for dialog open/close
watch(open, (newValue) => {
  console.log('[InviteDialog] Dialog open state changed to:', newValue)

  if (newValue) {
    // Dialog opened, make sure data is set
    setFormDataFromStore()
  }
  else {
    // When dialog closes, reset the form and clear store state
    resetForm()

    // Clear email and role
    email.value = ''
    role.value = ''
    orgId.value = ''

    if (displayStore.showInviteNewUserWithoutAccountDialog) {
      displayStore.showInviteNewUserWithoutAccountDialog = null
    }

    // Don't clear refreshFunction here (will be cleared after potential use)

    logState()
  }
})

// Set up initial data when mounted
onMounted(() => {
  console.log('[InviteDialog] Component mounted, store value:', displayStore.showInviteNewUserWithoutAccountDialog)

  if (displayStore.showInviteNewUserWithoutAccountDialog) {
    setFormDataFromStore()
    open.value = true
  }

  logState()
})

async function handleSubmit() {
  if (isSubmitting.value)
    return // Prevent multiple submissions

  logState()

  if (!firstName.value.trim()) {
    toast.error(t('first-name-required', 'First name is required'))
    return
  }

  if (!lastName.value.trim()) {
    toast.error(t('last-name-required', 'Last name is required'))
    return
  }

  if (!captchaToken.value) {
    toast.error(t('captcha-required', 'Captcha verification is required'))
    return
  }

  isSubmitting.value = true

  try {
    // Extract the actual role without 'invite_' prefix
    const inviteType = role.value.replace(/\s+/g, '_').replace('invite_', '')

    const { error } = await supabase.functions.invoke('private/invite_new_user_to_org', {
      body: {
        email: email.value,
        org_id: orgId.value,
        invite_type: inviteType,
        captcha_token: captchaToken.value,
        first_name: firstName.value,
        last_name: lastName.value,
      },
    })

    if (error) {
      console.error('Invitation failed:', error)
      toast.error(t('invitation-failed', 'Invitation failed'))
      return
    }

    toast.success(t('org-invited-user', 'User has been invited successfully'))

    // Close the dialog when done
    closeDialog()

    // Refresh the list of users using our stored function reference
    if (refreshFunction.value) {
      console.log('[InviteDialog] Calling refresh function')
      await refreshFunction.value()
      // After the refresh is complete, clear the reference
      refreshFunction.value = null
    }
    else {
      console.warn('[InviteDialog] No refresh function available')
    }
  }
  catch (error) {
    console.error('Invitation failed:', error)
    toast.error(t('invitation-failed', 'Invitation failed'))
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div>
    <dialog id="invite_user_modal" class="modal" :open="open">
      <div class="bg-white modal-box dark:bg-base-200 max-h-[80vh] max-w-md w-full sm:w-[480px] md:w-[540px]" :class="displayStore.dialogOption?.size ?? ''">
        <div class="absolute flex flex-col right-2 top-2">
          <button class="ml-auto btn btn-sm btn-circle btn-ghost" @click="closeDialog">
            ✕
          </button>
        </div>
        <h3 class="text-lg font-bold text-center" :class="displayStore.dialogOption?.headerStyle">
          {{ t('invite-new-user-dialog-header', 'Invite New User') }}
        </h3>

        <div class="mt-6 px-4">
          <form @submit.prevent="handleSubmit">
            <!-- Email (not editable) -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ t('email', 'Email') }}
              </label>
              <FormKit
                v-model="email"
                type="email"
                disabled
                :classes="{
                  outer: 'mb-0 w-full',
                  input: 'w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 dark:bg-gray-700 dark:border-gray-600 cursor-not-allowed',
                }"
              />
            </div>

            <!-- Role (not editable) -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ t('role', 'Role') }}
              </label>
              <FormKit
                v-model="role"
                type="text"
                disabled
                :classes="{
                  outer: 'mb-0 w-full',
                  input: 'w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 dark:bg-gray-700 dark:border-gray-600 cursor-not-allowed',
                }"
              />
            </div>

            <!-- First Name -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ t('first-name', 'First Name') }}
              </label>
              <FormKit
                v-model="firstName"
                type="text"
                :classes="{
                  outer: 'mb-0 w-full',
                  input: 'w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-800 dark:border-gray-600',
                }"
              />
            </div>

            <!-- Last Name -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ t('last-name', 'Last Name') }}
              </label>
              <FormKit
                v-model="lastName"
                type="text"
                :classes="{
                  outer: 'mb-0 w-full',
                  input: 'w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-800 dark:border-gray-600',
                }"
              />
            </div>

            <!-- Captcha -->
            <div class="mb-4 mt-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ t('captcha', 'Captcha') }}
              </label>
              <VueTurnstile v-if="captchaKey" ref="captchaElement" v-model="captchaToken" size="flexible" :site-key="captchaKey" />
              <div v-else class="text-sm text-gray-600 dark:text-gray-400 text-center py-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                {{ t('captcha-not-available', 'Captcha not available on local') }}
              </div>
            </div>

            <!-- Submit Button -->
            <div class="mt-6 flex flex-col items-center">
              <button
                type="submit"
                :disabled="!isFormValid || isSubmitting"
                class="px-6 py-2 font-medium rounded-lg transition-colors relative"
                :class="isFormValid && !isSubmitting
                  ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                  : 'bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed'"
              >
                <span :class="{ 'opacity-0': isSubmitting }">
                  {{ t('send-invitation', 'Send Invitation') }}
                </span>
                <div v-if="isSubmitting" class="absolute inset-0 flex items-center justify-center">
                  <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              </button>
              <p v-if="!isFormValid" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {{ t('complete-all-fields', 'Please complete all required fields to continue') }}
              </p>
              <div class="mt-1 flex items-center text-2xs text-blue-600 dark:text-blue-400 cursor-pointer group relative" :class="{ 'mt-4': isFormValid }">
                <IconInformation class="w-4 h-4 mr-1" />
                <span class="font-medium">Why do I need this?</span>

                <!-- Tooltip that appears on hover -->
                <div class="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg w-60 text-center pointer-events-none">
                  {{ t('captcha-new-user-org-tooltip') }}
                  <!-- Tooltip arrow -->
                  <div class="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800" />
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </dialog>
    <div v-if="open" class="fixed inset-0 z-40 bg-black/50" @click="closeDialog" />
  </div>
</template>
