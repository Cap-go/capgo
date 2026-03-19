<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import InviteTeammateModal from '~/components/dashboard/InviteTeammateModal.vue'
import { uploadOrgLogoFile } from '~/services/photos'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

type OnboardingStep = 'details' | 'logo' | 'invite'
type OnboardingMode = 'website' | 'name'

interface InviteTeammateModalRef {
  openDialog: () => void
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const supabase = useSupabase()
const main = useMainStore()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)

const step = ref<OnboardingStep>('details')
const mode = ref<OnboardingMode>('website')
const websiteInput = ref('')
const orgNameInput = ref('')
const importedOrgName = ref('')
const createdOrgId = ref('')
const isSubmitting = ref(false)
const isUploadingLogo = ref(false)
const selectedLogoPreview = ref('')
const inviteSuccessCount = ref(0)
const inviteModalRef = ref<InviteTeammateModalRef | null>(null)
const logoInputRef = useTemplateRef<HTMLInputElement>('logoInput')

const onboardingSteps: Array<{ id: OnboardingStep, label: string }> = [
  { id: 'details', label: t('organization-onboarding-step-details', 'Create org') },
  { id: 'logo', label: t('organization-onboarding-step-logo', 'Add logo') },
  { id: 'invite', label: t('organization-onboarding-step-invite', 'Invite users') },
]

const activeOrgId = computed(() => createdOrgId.value || currentOrganization.value?.gid || '')
const activeOrgName = computed(() => {
  if (currentOrganization.value?.gid === activeOrgId.value)
    return currentOrganization.value.name
  return importedOrgName.value || orgNameInput.value.trim()
})

const websiteHostname = computed(() => {
  const value = websiteInput.value.trim()
  if (!value)
    return ''

  try {
    const normalized = /^https?:\/\//.test(value) ? value : `https://${value}`
    return new URL(normalized).hostname.replace(/^www\./, '')
  }
  catch {
    return ''
  }
})

const importedLogoUrl = computed(() => {
  if (!websiteHostname.value)
    return ''
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(websiteHostname.value)}&sz=256`
})

function toTitleCaseSegment(segment: string) {
  return segment
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function deriveOrgNameFromWebsite(hostname: string) {
  const primarySegment = hostname.split('.').filter(Boolean)[0] ?? ''
  return toTitleCaseSegment(primarySegment)
}

function isStepDone(stepId: OnboardingStep) {
  const order: OnboardingStep[] = ['details', 'logo', 'invite']
  return order.indexOf(stepId) < order.indexOf(step.value)
}

function isStepActive(stepId: OnboardingStep) {
  return step.value === stepId
}

async function syncRouteQuery(nextStep: OnboardingStep, orgId = createdOrgId.value) {
  await router.replace({
    path: '/onboarding/organization',
    query: {
      ...(orgId ? { org: orgId } : {}),
      step: nextStep,
    },
  })
}

async function hydrateOnboardingFromQuery() {
  await organizationStore.fetchOrganizations()

  const queryOrgId = typeof route.query.org === 'string' ? route.query.org : ''
  const queryStep = typeof route.query.step === 'string' ? route.query.step as OnboardingStep : 'details'

  if (queryOrgId) {
    createdOrgId.value = queryOrgId
    organizationStore.setCurrentOrganization(queryOrgId)
  }

  if (queryStep === 'logo' || queryStep === 'invite')
    step.value = queryStep
}

async function createOrganization() {
  if (isSubmitting.value)
    return

  let orgName = orgNameInput.value.trim()
  if (mode.value === 'website') {
    if (!websiteHostname.value) {
      toast.error(t('organization-onboarding-website-invalid', 'Enter a valid website'))
      return
    }
    orgName = deriveOrgNameFromWebsite(websiteHostname.value)
    importedOrgName.value = orgName
  }

  if (!orgName) {
    toast.error(t('org-name-required', 'Organization name is required'))
    return
  }

  isSubmitting.value = true

  try {
    const { data, error } = await supabase
      .from('orgs')
      .insert({
        name: orgName,
        created_by: main.auth?.id ?? '',
        management_email: main.auth?.email ?? '',
      })
      .select('id')
      .single()

    if (error || !data?.id) {
      console.error('Error creating organization during onboarding', error)
      toast.error(error?.code === '23505'
        ? t('org-with-this-name-exists', 'An organization with this name already exists')
        : t('cannot-create-org', 'Cannot create organization'))
      return
    }

    createdOrgId.value = data.id
    await organizationStore.fetchOrganizations()
    organizationStore.setCurrentOrganization(data.id)
    step.value = 'logo'
    toast.success(t('org-created-successfully', 'Organization created'))
    await syncRouteQuery('logo', data.id)
  }
  finally {
    isSubmitting.value = false
  }
}

async function uploadLogoBlob(blob: Blob, filename?: string) {
  const orgId = activeOrgId.value
  if (!orgId) {
    toast.error(t('organization-not-found', 'Organization not found'))
    return
  }

  isUploadingLogo.value = true
  try {
    await uploadOrgLogoFile(orgId, blob, filename)
    step.value = 'invite'
    toast.success(t('organization-onboarding-logo-saved', 'Logo saved'))
    await syncRouteQuery('invite', orgId)
  }
  catch (error) {
    console.error('Failed to upload organization logo during onboarding', error)
    toast.error(t('something-went-wrong-try-again-later', 'Something went wrong, try again later'))
  }
  finally {
    isUploadingLogo.value = false
  }
}

async function useImportedLogo() {
  if (!importedLogoUrl.value) {
    toast.error(t('organization-onboarding-imported-logo-unavailable', 'No imported logo available'))
    return
  }

  try {
    const response = await fetch(importedLogoUrl.value)
    const blob = await response.blob()
    await uploadLogoBlob(blob, `${websiteHostname.value || 'website-logo'}.png`)
  }
  catch (error) {
    console.error('Failed to fetch imported logo', error)
    toast.error(t('organization-onboarding-imported-logo-failed', 'Could not import logo from website'))
  }
}

function openLogoPicker() {
  logoInputRef.value?.click()
}

async function onLogoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return

  if (selectedLogoPreview.value)
    URL.revokeObjectURL(selectedLogoPreview.value)
  selectedLogoPreview.value = URL.createObjectURL(file)
  await uploadLogoBlob(file, file.name)
  input.value = ''
}

async function skipLogo() {
  step.value = 'invite'
  await syncRouteQuery('invite')
}

function openInviteModal() {
  if (!activeOrgId.value) {
    toast.error(t('organization-not-found', 'Organization not found'))
    return
  }
  inviteModalRef.value?.openDialog()
}

async function finishOnboarding() {
  await organizationStore.fetchOrganizations()
  if (activeOrgId.value)
    organizationStore.setCurrentOrganization(activeOrgId.value)
  await router.push('/apps')
}

watch(() => route.query.step, (nextValue) => {
  if (typeof nextValue !== 'string')
    return
  if (nextValue === 'details' || nextValue === 'logo' || nextValue === 'invite')
    step.value = nextValue
})

onMounted(async () => {
  displayStore.NavTitle = t('organization-onboarding-title', 'Organization onboarding')
  displayStore.defaultBack = '/apps'
  await hydrateOnboardingFromQuery()
})

onUnmounted(() => {
  if (selectedLogoPreview.value)
    URL.revokeObjectURL(selectedLogoPreview.value)
})
</script>

<template>
  <div class="overflow-y-auto px-4 py-6 mx-auto w-full max-w-6xl sm:px-6 lg:px-8">
    <InviteTeammateModal ref="inviteModalRef" @success="inviteSuccessCount += 1" />
    <input
      ref="logoInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onLogoSelected"
    >

    <div class="overflow-hidden bg-white border shadow-xl rounded-3xl border-slate-200 dark:bg-slate-900 dark:border-slate-800">
      <div class="px-6 py-8 border-b sm:px-8 border-slate-200 dark:border-slate-800">
        <span class="inline-flex px-3 py-1 text-xs font-semibold tracking-[0.12em] text-violet-700 uppercase rounded-full bg-violet-50 dark:bg-violet-900/30 dark:text-violet-200">
          {{ t('organization-onboarding-badge', 'Get started') }}
        </span>
        <h1 class="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">
          {{ t('organization-onboarding-title', 'Create your organization') }}
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          {{ t('organization-onboarding-subtitle', 'Create the org first, then add a logo and invite your team before you start creating apps.') }}
        </p>

        <div class="grid gap-3 mt-6 sm:grid-cols-3">
          <div
            v-for="entry in onboardingSteps"
            :key="entry.id"
            class="px-4 py-3 rounded-2xl border"
            :class="[
              isStepActive(entry.id) ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200' : '',
              !isStepActive(entry.id) && isStepDone(entry.id) ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' : '',
              !isStepActive(entry.id) && !isStepDone(entry.id) ? 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300' : '',
            ]"
          >
            <div class="text-xs font-semibold uppercase">
              {{ entry.label }}
            </div>
          </div>
        </div>
      </div>

      <div class="px-6 py-8 sm:px-8">
        <section v-if="step === 'details'" class="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]">
          <div class="space-y-6">
            <div class="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                class="p-4 text-left rounded-2xl border transition"
                :class="mode === 'website' ? 'border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30' : 'border-slate-200 dark:border-slate-700'"
                @click="mode = 'website'"
              >
                <div class="text-base font-semibold text-slate-900 dark:text-white">
                  {{ t('organization-onboarding-mode-website', 'Website auto import') }}
                </div>
                <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {{ t('organization-onboarding-mode-website-desc', 'Start from your website and prefill the organization name from its domain.') }}
                </p>
              </button>
              <button
                type="button"
                class="p-4 text-left rounded-2xl border transition"
                :class="mode === 'name' ? 'border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30' : 'border-slate-200 dark:border-slate-700'"
                @click="mode = 'name'"
              >
                <div class="text-base font-semibold text-slate-900 dark:text-white">
                  {{ t('organization-onboarding-mode-name', 'Enter a name') }}
                </div>
                <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {{ t('organization-onboarding-mode-name-desc', 'Create the org manually if you do not want to import anything from a website.') }}
                </p>
              </button>
            </div>

            <div v-if="mode === 'website'" class="space-y-3">
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-200">
                {{ t('organization-onboarding-website-label', 'Website') }}
              </label>
              <input
                v-model="websiteInput"
                type="url"
                placeholder="https://capgo.app"
                class="block py-3 px-4 w-full rounded-2xl border border-slate-300 shadow-sm dark:text-white dark:border-slate-700 dark:bg-slate-950"
              >
              <p class="text-sm text-slate-500 dark:text-slate-400">
                {{ websiteHostname ? t('organization-onboarding-website-preview', 'Organization name preview') : t('organization-onboarding-website-help', 'Enter your company website to derive the org name.') }}
                <span v-if="websiteHostname" class="font-semibold text-slate-700 dark:text-slate-200">: {{ deriveOrgNameFromWebsite(websiteHostname) }}</span>
              </p>
            </div>

            <div v-else class="space-y-3">
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-200">
                {{ t('organization-name', 'Organization name') }}
              </label>
              <input
                v-model="orgNameInput"
                type="text"
                :placeholder="t('organization-name', 'Organization name')"
                class="block py-3 px-4 w-full rounded-2xl border border-slate-300 shadow-sm dark:text-white dark:border-slate-700 dark:bg-slate-950"
              >
            </div>

            <div class="flex gap-3 items-center">
              <button
                type="button"
                class="d-btn d-btn-primary"
                :disabled="isSubmitting"
                @click="createOrganization"
              >
                <span v-if="!isSubmitting">{{ t('organization-onboarding-continue-logo', 'Continue to logo') }}</span>
                <Spinner v-else size="w-5 h-5" />
              </button>
            </div>
          </div>

          <div class="p-6 rounded-3xl border bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800">
            <div class="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
              {{ t('organization-onboarding-summary', 'Summary') }}
            </div>
            <div class="mt-4 space-y-4">
              <div>
                <div class="text-xs font-medium uppercase text-slate-400 dark:text-slate-500">
                  {{ t('organization-onboarding-selected-path', 'Selected flow') }}
                </div>
                <div class="mt-1 text-base text-slate-900 dark:text-white">
                  {{ mode === 'website' ? t('organization-onboarding-mode-website', 'Website auto import') : t('organization-onboarding-mode-name', 'Enter a name') }}
                </div>
              </div>
              <div>
                <div class="text-xs font-medium uppercase text-slate-400 dark:text-slate-500">
                  {{ t('organization-onboarding-next-steps', 'Next steps') }}
                </div>
                <ul class="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li>{{ t('organization-onboarding-next-logo', '1. Save the organization logo') }}</li>
                  <li>{{ t('organization-onboarding-next-invite', '2. Invite teammates') }}</li>
                  <li>{{ t('organization-onboarding-next-apps', '3. Start app onboarding') }}</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="step === 'logo'" class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="space-y-6">
            <div>
              <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
                {{ t('organization-onboarding-logo-title', 'Add a logo') }}
              </h2>
              <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {{ t('organization-onboarding-logo-subtitle', 'Upload a logo now, or skip and do it later from organization settings.') }}
              </p>
            </div>

            <div class="flex gap-4 items-center p-5 rounded-3xl border border-slate-200 dark:border-slate-700">
              <div class="flex justify-center items-center w-20 h-20 text-2xl font-semibold text-white rounded-2xl bg-slate-800">
                <img
                  v-if="currentOrganization?.logo"
                  :src="currentOrganization.logo"
                  :alt="`${activeOrgName} logo`"
                  class="object-cover w-20 h-20 rounded-2xl"
                >
                <img
                  v-else-if="selectedLogoPreview"
                  :src="selectedLogoPreview"
                  :alt="`${activeOrgName} logo preview`"
                  class="object-cover w-20 h-20 rounded-2xl"
                >
                <span v-else>{{ (activeOrgName || 'O').slice(0, 2).toUpperCase() }}</span>
              </div>
              <div>
                <div class="text-lg font-semibold text-slate-900 dark:text-white">
                  {{ activeOrgName || t('organization-onboarding-org-placeholder', 'New organization') }}
                </div>
                <div class="text-sm text-slate-500 dark:text-slate-400">
                  {{ t('organization-onboarding-logo-helper', 'Recommended: square image, 256x256 or larger') }}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-3">
              <button type="button" class="d-btn d-btn-primary" :disabled="isUploadingLogo" @click="openLogoPicker">
                {{ t('organization-onboarding-upload-logo', 'Upload logo') }}
              </button>
              <button
                v-if="importedLogoUrl"
                type="button"
                class="d-btn d-btn-secondary"
                :disabled="isUploadingLogo"
                @click="useImportedLogo"
              >
                {{ t('organization-onboarding-use-imported-logo', 'Use imported logo') }}
              </button>
              <button type="button" class="d-btn d-btn-ghost" :disabled="isUploadingLogo" @click="skipLogo">
                {{ t('skip', 'Skip') }}
              </button>
            </div>
          </div>

          <div v-if="importedLogoUrl" class="p-6 rounded-3xl border bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800">
            <div class="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
              {{ t('organization-onboarding-import-preview', 'Imported preview') }}
            </div>
            <div class="flex gap-4 items-center mt-4">
              <img :src="importedLogoUrl" alt="Imported website logo preview" class="w-16 h-16 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div class="text-sm text-slate-600 dark:text-slate-300">
                {{ websiteHostname }}
              </div>
            </div>
          </div>
        </section>

        <section v-else class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="space-y-6">
            <div>
              <h2 class="text-2xl font-semibold text-slate-900 dark:text-white">
                {{ t('organization-onboarding-invite-title', 'Invite your users') }}
              </h2>
              <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {{ t('organization-onboarding-invite-subtitle', 'Invite teammates now or finish onboarding and do it later from the members page.') }}
              </p>
            </div>

            <div class="p-6 rounded-3xl border border-slate-200 dark:border-slate-700">
              <div class="text-base font-semibold text-slate-900 dark:text-white">
                {{ activeOrgName || t('organization-onboarding-org-placeholder', 'New organization') }}
              </div>
              <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {{ inviteSuccessCount > 0
                  ? t('organization-onboarding-invite-success-state', 'Invitations sent. You can keep inviting more users or continue to apps.')
                  : t('organization-onboarding-invite-empty-state', 'No invitations sent yet.') }}
              </p>
            </div>

            <div class="flex flex-wrap gap-3">
              <button type="button" class="d-btn d-btn-primary" @click="openInviteModal">
                {{ t('organization-onboarding-open-invite', 'Invite users') }}
              </button>
              <button type="button" class="d-btn d-btn-secondary" @click="finishOnboarding">
                {{ t('organization-onboarding-finish', 'Continue to apps') }}
              </button>
            </div>
          </div>

          <div class="p-6 rounded-3xl border bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800">
            <div class="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
              {{ t('organization-onboarding-what-next', 'What happens next') }}
            </div>
            <ul class="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <li>{{ t('organization-onboarding-after-invite-1', 'Members receive an invite and can join the organization.') }}</li>
              <li>{{ t('organization-onboarding-after-invite-2', 'The new organization stays selected in the org switcher.') }}</li>
              <li>{{ t('organization-onboarding-after-invite-3', 'The next step after this page is app onboarding.') }}</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
