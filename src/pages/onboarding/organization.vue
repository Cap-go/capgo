<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconCheck from '~icons/lucide/check'
import IconLoader from '~icons/lucide/loader-2'
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

interface WebsitePreview {
  hostname: string
  name: string
  icon: string | null
  website: string
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
const isLoadingWebsitePreview = ref(false)
const selectedLogoPreview = ref('')
const inviteSuccessCount = ref(0)
const websitePreview = ref<WebsitePreview | null>(null)
const inviteModalRef = ref<InviteTeammateModalRef | null>(null)
const logoInputRef = useTemplateRef<HTMLInputElement>('logoInput')

const onboardingSteps: Array<{ id: OnboardingStep, label: string }> = [
  { id: 'details', label: t('organization-onboarding-step-details', 'Create org') },
  { id: 'logo', label: t('organization-onboarding-step-logo', 'Add logo') },
  { id: 'invite', label: t('organization-onboarding-step-invite', 'Invite users') },
]

const activeOrgId = computed(() => createdOrgId.value || '')
const activeOrgName = computed(() => {
  if (currentOrganization.value?.gid === activeOrgId.value)
    return currentOrganization.value.name
  return websitePreview.value?.name || importedOrgName.value || orgNameInput.value.trim()
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

const importedLogoUrl = computed(() => websitePreview.value?.icon ?? '')

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
      ...(typeof route.query.to === 'string' ? { to: route.query.to } : {}),
      step: nextStep,
    },
  })
}

async function hydrateOnboardingFromQuery() {
  await organizationStore.fetchOrganizations()

  const queryOrgId = typeof route.query.org === 'string' ? route.query.org : ''
  const queryStep = typeof route.query.step === 'string' ? route.query.step as OnboardingStep : 'details'

  const validatedOrg = queryOrgId
    ? organizationStore.organizations.find(org => org.gid === queryOrgId && !org.role.includes('invite'))
    : null

  if (validatedOrg) {
    createdOrgId.value = queryOrgId
    organizationStore.setCurrentOrganization(queryOrgId)
  }
  else {
    createdOrgId.value = ''
  }

  if (validatedOrg && (queryStep === 'logo' || queryStep === 'invite'))
    step.value = queryStep
  else if (queryStep === 'logo' || queryStep === 'invite')
    await syncRouteQuery('details', '')
}

async function fetchWebsitePreview() {
  if (mode.value !== 'website')
    return null

  if (!websiteHostname.value) {
    toast.error(t('organization-onboarding-website-invalid', 'Enter a valid website'))
    return null
  }

  isLoadingWebsitePreview.value = true
  try {
    const { data, error } = await supabase.functions.invoke('private/website_preview', {
      body: {
        website: websiteInput.value.trim(),
      },
    })

    if (error || !data) {
      console.error('Failed to fetch website preview', error)
      toast.error(t('organization-onboarding-website-fetch-failed', 'Could not import website assets'))
      return null
    }

    websitePreview.value = data as WebsitePreview
    importedOrgName.value = data.name || deriveOrgNameFromWebsite(websiteHostname.value)
    return websitePreview.value
  }
  finally {
    isLoadingWebsitePreview.value = false
  }
}

async function createOrganization() {
  if (isSubmitting.value || !main.auth)
    return

  let orgName = orgNameInput.value.trim()
  if (mode.value === 'website') {
    const preview = await fetchWebsitePreview()
    if (!preview)
      return

    orgName = preview.name || deriveOrgNameFromWebsite(websiteHostname.value)
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
        created_by: main.auth.id,
        management_email: main.auth.email ?? '',
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
    step.value = 'logo'
    toast.success(t('org-created-successfully', 'Organization created'))

    try {
      await organizationStore.fetchOrganizations()
      organizationStore.setCurrentOrganization(data.id)
    }
    catch (error) {
      console.error('Failed to refresh organizations after onboarding create', error)
      toast.error(t('organization-onboarding-refresh-failed', 'Organization created, but we could not refresh the org list'))
    }

    try {
      await syncRouteQuery('logo', data.id)
    }
    catch (error) {
      console.error('Failed to sync onboarding route after create', error)
    }
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
    if (importedLogoUrl.value.startsWith('data:')) {
      const [header, payload = ''] = importedLogoUrl.value.split(',', 2)
      const contentType = header.match(/^data:([^;]+)/)?.[1] ?? ''
      if (!contentType.startsWith('image/') || !payload) {
        toast.error(t('organization-onboarding-imported-logo-failed', 'Could not import logo from website'))
        return
      }

      const binary = atob(payload)
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
      const blob = new Blob([bytes], { type: contentType })
      await uploadLogoBlob(blob, `${websiteHostname.value || 'website-logo'}.png`)
      return
    }

    const response = await fetch(importedLogoUrl.value)
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!response.ok || !contentType.startsWith('image/')) {
      toast.error(t('organization-onboarding-imported-logo-failed', 'Could not import logo from website'))
      return
    }
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
  if (activeOrgId.value)
    organizationStore.setCurrentOrganization(activeOrgId.value)
  step.value = 'invite'
  await syncRouteQuery('invite')
}

function openInviteModal() {
  if (!activeOrgId.value) {
    toast.error(t('organization-not-found', 'Organization not found'))
    return
  }
  organizationStore.setCurrentOrganization(activeOrgId.value)
  inviteModalRef.value?.openDialog()
}

async function finishOnboarding() {
  await organizationStore.fetchOrganizations()
  if (activeOrgId.value)
    organizationStore.setCurrentOrganization(activeOrgId.value)

  const nextPath = typeof route.query.to === 'string' && route.query.to && !route.query.to.startsWith('/onboarding/')
    ? route.query.to
    : '/apps'
  await router.push(nextPath)
}

watch(() => route.query.step, (nextValue) => {
  if (typeof nextValue !== 'string')
    return

  if (nextValue === 'details') {
    step.value = 'details'
    return
  }

  if ((nextValue === 'logo' || nextValue === 'invite') && createdOrgId.value) {
    step.value = nextValue
    return
  }

  if (nextValue === 'logo' || nextValue === 'invite')
    void syncRouteQuery('details', '')
})

watch([websiteInput, mode], () => {
  if (mode.value !== 'website') {
    websitePreview.value = null
    return
  }

  websitePreview.value = null
})

onMounted(async () => {
  if (!main.auth) {
    await router.replace('/login?to=/onboarding/organization')
    return
  }
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
  <section class="h-full py-10 overflow-y-auto sm:py-16 max-h-fit">
    <div class="px-4 mx-auto max-w-5xl sm:px-6 lg:px-8">
      <InviteTeammateModal ref="inviteModalRef" @success="inviteSuccessCount += 1" />
      <input
        ref="logoInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onLogoSelected"
      >

      <div class="space-y-6">
        <div class="text-center">
          <p class="text-sm font-semibold tracking-[0.18em] uppercase text-azure-500">
            {{ t('organization-onboarding-badge', 'Get started') }}
          </p>
          <h1 class="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
            {{ t('organization-onboarding-title', 'Create your organization') }}
          </h1>
          <p class="max-w-2xl mx-auto mt-3 text-base text-slate-600">
            {{ t('organization-onboarding-subtitle', 'Create the org first, then add a logo and invite your team before you start creating apps.') }}
          </p>
        </div>

        <div class="flex flex-wrap justify-center gap-3">
          <div
            v-for="entry in onboardingSteps"
            :key="entry.id"
            class="rounded-full border px-4 py-2 text-sm font-medium transition"
            :class="[
              isStepActive(entry.id) ? 'border-azure-300 bg-azure-50 text-azure-700' : '',
              !isStepActive(entry.id) && isStepDone(entry.id) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : '',
              !isStepActive(entry.id) && !isStepDone(entry.id) ? 'border-slate-200 bg-white text-slate-500' : '',
            ]"
          >
            {{ entry.label }}
          </div>
        </div>

        <div v-if="step === 'details'" class="p-6 bg-white border shadow-sm rounded-3xl border-slate-200">
          <div class="grid gap-6 md:grid-cols-[1.25fr_0.9fr]">
            <div class="space-y-5">
              <div class="rounded-2xl border border-slate-200 p-4">
                <p class="text-sm font-medium text-slate-900">
                  {{ t('organization-onboarding-selected-path', 'Selected flow') }}
                </p>
                <div class="grid gap-3 mt-4 sm:grid-cols-2">
                  <button
                    type="button"
                    class="rounded-2xl border p-4 text-left transition"
                    :class="mode === 'website' ? 'border-azure-300 bg-azure-50 shadow-sm' : 'border-slate-200 hover:border-azure-200'"
                    data-test="onboarding-mode-website"
                    @click="mode = 'website'"
                  >
                    <div class="text-base font-semibold text-slate-900">
                      {{ t('organization-onboarding-mode-website', 'Website auto import') }}
                    </div>
                    <p class="mt-2 text-sm text-slate-600">
                      {{ t('organization-onboarding-mode-website-desc', 'Start from your website and prefill the organization name from its domain.') }}
                    </p>
                  </button>
                  <button
                    type="button"
                    class="rounded-2xl border p-4 text-left transition"
                    :class="mode === 'name' ? 'border-azure-300 bg-azure-50 shadow-sm' : 'border-slate-200 hover:border-azure-200'"
                    data-test="onboarding-mode-name"
                    @click="mode = 'name'"
                  >
                    <div class="text-base font-semibold text-slate-900">
                      {{ t('organization-onboarding-mode-name', 'Enter a name') }}
                    </div>
                    <p class="mt-2 text-sm text-slate-600">
                      {{ t('organization-onboarding-mode-name-desc', 'Create the org manually if you do not want to import anything from a website.') }}
                    </p>
                  </button>
                </div>
              </div>

              <div v-if="mode === 'website'">
                <label class="text-sm font-medium text-slate-800">
                  {{ t('organization-onboarding-website-label', 'Website') }}
                </label>
                <input
                  v-model="websiteInput"
                  type="url"
                  placeholder="https://capgo.app"
                  data-test="onboarding-website"
                  class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                >
                <p class="mt-2 text-xs text-slate-500">
                  {{ websitePreview?.name
                    ? t('organization-onboarding-website-preview', 'Organization name preview')
                    : websiteHostname
                      ? t('organization-onboarding-website-help-loading', 'Website assets will be imported when you continue.')
                      : t('organization-onboarding-website-help', 'Enter your company website to infer the organization name and logo from its assets.') }}
                  <span v-if="websitePreview?.name" class="font-semibold text-slate-700">: {{ websitePreview.name }}</span>
                </p>
              </div>

              <div v-else>
                <label class="text-sm font-medium text-slate-800">
                  {{ t('organization-name', 'Organization name') }}
                </label>
                <input
                  v-model="orgNameInput"
                  type="text"
                  :placeholder="t('organization-name', 'Organization name')"
                  data-test="onboarding-org-name"
                  class="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
                >
              </div>

              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  class="d-btn d-btn-primary"
                  data-test="onboarding-create-org"
                  :disabled="isSubmitting || isLoadingWebsitePreview || !main.auth"
                  @click="createOrganization"
                >
                  <span v-if="!isSubmitting && !isLoadingWebsitePreview">{{ t('organization-onboarding-continue-logo', 'Continue to logo') }}</span>
                  <IconLoader v-else class="w-4 h-4 animate-spin" />
                </button>
                <button type="button" class="d-btn d-btn-outline" @click="router.push('/apps')">
                  {{ t('cancel', 'Cancel') }}
                </button>
              </div>
            </div>

            <div class="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
              <div class="rounded-[24px] border border-white/10 bg-slate-900 p-5">
                <div class="flex items-center gap-4">
                  <div class="flex h-18 w-18 items-center justify-center overflow-hidden rounded-[22px] bg-slate-800 text-2xl font-semibold">
                    <img
                      v-if="importedLogoUrl || selectedLogoPreview || currentOrganization?.logo"
                      :src="currentOrganization?.logo || selectedLogoPreview || importedLogoUrl"
                      :alt="`${activeOrgName} logo preview`"
                      class="h-full w-full object-cover"
                    >
                    <span v-else>{{ (activeOrgName || 'O').slice(0, 2).toUpperCase() }}</span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {{ t('organization-onboarding-summary', 'Summary') }}
                    </p>
                    <p class="truncate text-lg font-semibold">
                      {{ activeOrgName || t('organization-onboarding-org-placeholder', 'New organization') }}
                    </p>
                    <p class="mt-1 truncate text-xs text-slate-400">
                      {{ websiteHostname || t('organization-onboarding-mode-name', 'Enter a name') }}
                    </p>
                  </div>
                </div>

                <div class="mt-6 space-y-4 text-sm text-slate-300">
                  <div>
                    <div class="text-xs font-medium uppercase text-slate-500">
                      {{ t('organization-onboarding-selected-path', 'Selected flow') }}
                    </div>
                    <div class="mt-1 text-base text-white">
                      {{ mode === 'website' ? t('organization-onboarding-mode-website', 'Website auto import') : t('organization-onboarding-mode-name', 'Enter a name') }}
                    </div>
                  </div>
                  <div>
                    <div class="text-xs font-medium uppercase text-slate-500">
                      {{ t('organization-onboarding-next-steps', 'Next steps') }}
                    </div>
                    <ul class="mt-3 space-y-3">
                      <li class="flex gap-3">
                        <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {{ t('organization-onboarding-next-logo', '1. Save the organization logo') }}
                      </li>
                      <li class="flex gap-3">
                        <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {{ t('organization-onboarding-next-invite', '2. Invite teammates') }}
                      </li>
                      <li class="flex gap-3">
                        <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {{ t('organization-onboarding-next-apps', '3. Start app onboarding') }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="step === 'logo'" class="p-6 bg-white border shadow-sm rounded-3xl border-slate-200">
          <div class="grid gap-6 md:grid-cols-[1.15fr_0.9fr]">
            <div class="space-y-5">
              <div>
                <p class="text-sm font-semibold tracking-[0.18em] uppercase text-azure-500">
                  {{ t('organization-onboarding-step-logo', 'Add logo') }}
                </p>
                <h2 class="mt-2 text-2xl font-semibold text-slate-900">
                  {{ t('organization-onboarding-logo-title', 'Add a logo') }}
                </h2>
                <p class="mt-2 text-sm text-slate-600">
                  {{ t('organization-onboarding-logo-subtitle', 'Upload a logo now, or skip and do it later from organization settings.') }}
                </p>
              </div>

              <div class="rounded-2xl border border-slate-200 p-5">
                <div class="flex items-center gap-4">
                  <div class="flex h-18 w-18 items-center justify-center overflow-hidden rounded-[22px] bg-slate-800 text-2xl font-semibold text-white">
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
                    <div class="text-lg font-semibold text-slate-900">
                      {{ activeOrgName || t('organization-onboarding-org-placeholder', 'New organization') }}
                    </div>
                    <div class="text-sm text-slate-500">
                      {{ t('organization-onboarding-logo-helper', 'Recommended: square image, 256x256 or larger') }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <button type="button" class="d-btn d-btn-primary" data-test="onboarding-upload-logo" :disabled="isUploadingLogo" @click="openLogoPicker">
                  {{ t('organization-onboarding-upload-logo', 'Upload logo') }}
                </button>
                <button
                  v-if="importedLogoUrl"
                  type="button"
                  class="d-btn d-btn-secondary"
                  data-test="onboarding-use-imported-logo"
                  :disabled="isUploadingLogo"
                  @click="useImportedLogo"
                >
                  {{ t('organization-onboarding-use-imported-logo', 'Use imported logo') }}
                </button>
                <button type="button" class="d-btn d-btn-ghost" data-test="onboarding-skip-logo" :disabled="isUploadingLogo" @click="skipLogo">
                  {{ t('skip', 'Skip') }}
                </button>
              </div>
            </div>

            <div class="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
              <div class="rounded-[24px] border border-white/10 bg-slate-900 p-5">
                <p class="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {{ t('organization-onboarding-import-preview', 'Imported preview') }}
                </p>
                <div class="mt-4 flex items-center gap-4">
                  <img
                    v-if="importedLogoUrl"
                    :src="importedLogoUrl"
                    alt="Imported website logo preview"
                    class="h-16 w-16 rounded-2xl border border-white/10 object-cover"
                  >
                  <div v-else class="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/40 text-xs text-slate-400">
                    No logo
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-white">
                      {{ activeOrgName || t('organization-onboarding-org-placeholder', 'New organization') }}
                    </p>
                    <p class="mt-1 truncate text-xs text-slate-400">
                      {{ websiteHostname || t('organization-onboarding-mode-name', 'Enter a name') }}
                    </p>
                  </div>
                </div>

                <ul class="mt-6 space-y-3 text-sm text-slate-300">
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    Upload your own asset if you want tighter brand control.
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    Skip this step if you just want to reach app setup quickly.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="p-6 bg-white border shadow-sm rounded-3xl border-slate-200">
          <div class="grid gap-6 md:grid-cols-[1.15fr_0.9fr]">
            <div class="space-y-5">
              <div>
                <p class="text-sm font-semibold tracking-[0.18em] uppercase text-azure-500">
                  {{ t('organization-onboarding-step-invite', 'Invite users') }}
                </p>
                <h2 class="mt-2 text-2xl font-semibold text-slate-900">
                  {{ t('organization-onboarding-invite-title', 'Invite your users') }}
                </h2>
                <p class="mt-2 text-sm text-slate-600">
                  {{ t('organization-onboarding-invite-subtitle', 'Invite teammates now or finish onboarding and do it later from the members page.') }}
                </p>
              </div>

              <div class="rounded-2xl border border-slate-200 p-5">
                <div class="text-base font-semibold text-slate-900">
                  {{ activeOrgName || t('organization-onboarding-org-placeholder', 'New organization') }}
                </div>
                <p class="mt-2 text-sm text-slate-500">
                  {{ inviteSuccessCount > 0
                    ? t('organization-onboarding-invite-success-state', 'Invitations sent. You can keep inviting more users or continue to apps.')
                    : t('organization-onboarding-invite-empty-state', 'No invitations sent yet.') }}
                </p>
              </div>

              <div class="flex flex-wrap gap-3">
                <button type="button" class="d-btn d-btn-primary" data-test="onboarding-invite-users" @click="openInviteModal">
                  {{ t('organization-onboarding-open-invite', 'Invite users') }}
                </button>
                <button type="button" class="d-btn d-btn-secondary" data-test="onboarding-finish" @click="finishOnboarding">
                  {{ t('organization-onboarding-finish', 'Continue to apps') }}
                </button>
              </div>
            </div>

            <div class="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
              <div class="rounded-[24px] border border-white/10 bg-slate-900 p-5">
                <p class="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {{ t('organization-onboarding-what-next', 'What happens next') }}
                </p>
                <ul class="mt-6 space-y-3 text-sm text-slate-300">
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('organization-onboarding-after-invite-1', 'Members receive an invite and can join the organization.') }}
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('organization-onboarding-after-invite-2', 'The new organization stays selected in the org switcher.') }}
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('organization-onboarding-after-invite-3', 'The next step after this page is app onboarding.') }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<route lang="yaml">
meta:
  middleware: auth
</route>
