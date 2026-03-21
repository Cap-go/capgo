<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconCheck from '~icons/lucide/check'
import IconLoader from '~icons/lucide/loader-2'
import IconBack from '~icons/material-symbols/arrow-back-ios-rounded'
import InviteTeammateModal from '~/components/dashboard/InviteTeammateModal.vue'
import { uploadOrgLogoFile } from '~/services/photos'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

type OnboardingStep = 'details' | 'logo' | 'invite'
type OnboardingMode = 'website' | 'name' | null

interface InviteTeammateModalRef {
  openDialog: () => void
}

interface SentInvite {
  email: string
  firstName: string
  lastName: string
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
const mode = ref<OnboardingMode>(null)
const websiteInput = ref('')
const orgNameInput = ref('')
const createdOrgId = ref('')
const isSubmitting = ref(false)
const isUploadingLogo = ref(false)
const isLoadingWebsitePreview = ref(false)
const selectedLogoPreview = ref('')
const sentInvites = ref<SentInvite[]>([])
const websitePreview = ref<WebsitePreview | null>(null)
const inviteModalRef = ref<InviteTeammateModalRef | null>(null)
const logoInputRef = useTemplateRef<HTMLInputElement>('logoInput')
const isAdditionalOrgFlow = ref(false)

const onboardingSteps: Array<{ id: OnboardingStep, label: string }> = [
  { id: 'details', label: t('organization-onboarding-step-details', 'Create org') },
  { id: 'logo', label: t('organization-onboarding-step-logo', 'Add logo') },
  { id: 'invite', label: t('organization-onboarding-step-invite', 'Invite users') },
]

const activeOrgId = computed(() => createdOrgId.value || '')
const activeOrgName = computed(() => {
  if (currentOrganization.value?.gid === activeOrgId.value)
    return currentOrganization.value.name
  return orgNameInput.value.trim() || websitePreview.value?.name || ''
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
const canShowOrgDetails = computed(() => mode.value !== null)
const canCreateOrganization = computed(() => {
  if (!main.auth || isSubmitting.value || isLoadingWebsitePreview.value || !mode.value)
    return false

  return !!orgNameInput.value.trim()
})
const hasExistingOrganization = computed(() => organizationStore.organizations.some(org => !org.role.includes('invite')))
const inviteSuccessCount = computed(() => sentInvites.value.length)
const isCompactCreateOrgFlow = computed(() => isAdditionalOrgFlow.value)
const onboardingBadge = computed(() => isCompactCreateOrgFlow.value
  ? t('organization-create-badge', 'New organization')
  : t('organization-onboarding-badge', 'Get started'))
const onboardingTitle = computed(() => isCompactCreateOrgFlow.value
  ? t('organization-create-title', 'Create a new organization')
  : t('organization-onboarding-title', 'Create your organization'))
const onboardingSubtitle = computed(() => isCompactCreateOrgFlow.value
  ? t('organization-create-subtitle', 'Set up another organization without going through onboarding again.')
  : t('organization-onboarding-subtitle', 'Create the org first, then add a logo and invite your team before you start creating apps.'))

function getInviteDisplayName(invite: SentInvite) {
  const fullName = `${invite.firstName} ${invite.lastName}`.trim()
  return fullName || invite.email
}

function getInviteInitials(invite: SentInvite) {
  const fullName = `${invite.firstName} ${invite.lastName}`.trim()
  if (fullName) {
    return fullName
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('')
  }

  return invite.email.slice(0, 2).toUpperCase()
}

function onInviteSuccess(invite: SentInvite) {
  sentInvites.value = [
    invite,
    ...sentInvites.value.filter(entry => entry.email !== invite.email),
  ]
}

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

async function goBack() {
  if (window.history.length > 1) {
    await router.back()
    return
  }

  const fallbackPath = typeof route.query.to === 'string' && route.query.to && !route.query.to.startsWith('/onboarding/')
    ? route.query.to
    : '/login'
  await router.push(fallbackPath)
}

async function syncRouteQuery(nextStep: OnboardingStep, orgId = createdOrgId.value) {
  await router.replace({
    path: '/onboarding/organization',
    query: {
      ...(orgId ? { org: orgId } : {}),
      ...(typeof route.query.source === 'string' ? { source: route.query.source } : {}),
      ...(typeof route.query.to === 'string' ? { to: route.query.to } : {}),
      step: nextStep,
    },
  })
}

async function hydrateOnboardingFromQuery() {
  await organizationStore.fetchOrganizations()
  isAdditionalOrgFlow.value = typeof route.query.source === 'string'
    ? route.query.source === 'org-switcher'
    : hasExistingOrganization.value

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
    orgNameInput.value = data.name || deriveNameFromWebsitePreview(data.hostname)
    return websitePreview.value
  }
  finally {
    isLoadingWebsitePreview.value = false
  }
}

function deriveNameFromWebsitePreview(hostname: string) {
  return deriveOrgNameFromWebsite(hostname || websiteHostname.value)
}

async function createOrganization() {
  if (isSubmitting.value || !main.auth)
    return

  if (!mode.value) {
    toast.error(t('organization-onboarding-mode-required', 'Choose how you want to start'))
    return
  }

  const orgName = orgNameInput.value.trim()
  if (!orgName) {
    toast.error(t('org-name-required', 'Organization name is required'))
    return
  }

  isSubmitting.value = true

  try {
    const normalizedWebsite = mode.value === 'website'
      ? websitePreview.value?.website
      : undefined

    const { data, error } = await supabase.functions.invoke('organization', {
      method: 'POST',
      body: {
        name: orgName,
        email: main.auth.email ?? '',
        website: normalizedWebsite,
      },
    })

    if (error || !data?.id) {
      console.error('Error creating organization during onboarding', error)
      toast.error(error?.code === '23505'
        ? t('org-with-this-name-exists', 'An organization with this name already exists')
        : t('cannot-create-org', 'Cannot create organization'))
      return
    }

    createdOrgId.value = data.id
    toast.success(t('org-created-successfully', 'Organization created'))

    try {
      await organizationStore.fetchOrganizations()
      organizationStore.setCurrentOrganization(data.id)
    }
    catch (error) {
      console.error('Failed to refresh organizations after onboarding create', error)
      toast.error(t('organization-onboarding-refresh-failed', 'Organization created, but we could not refresh the org list'))
    }

    if (mode.value === 'website' && importedLogoUrl.value) {
      try {
        const imported = await useImportedLogo()
        if (imported)
          return
      }
      catch (error) {
        console.error('Failed to import logo after organization create', error)
      }
    }

    step.value = 'logo'
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
    return false
  }

  try {
    if (importedLogoUrl.value.startsWith('data:')) {
      const [header, payload = ''] = importedLogoUrl.value.split(',', 2)
      const contentType = header.match(/^data:([^;]+)/)?.[1] ?? ''
      if (!contentType.startsWith('image/') || !payload) {
        toast.error(t('organization-onboarding-imported-logo-failed', 'Could not import logo from website'))
        return false
      }

      const binary = atob(payload)
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
      const blob = new Blob([bytes], { type: contentType })
      await uploadLogoBlob(blob, `${websiteHostname.value || 'website-logo'}.png`)
      return true
    }

    const response = await fetch(importedLogoUrl.value)
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!response.ok || !contentType.startsWith('image/')) {
      toast.error(t('organization-onboarding-imported-logo-failed', 'Could not import logo from website'))
      return false
    }
    const blob = await response.blob()
    await uploadLogoBlob(blob, `${websiteHostname.value || 'website-logo'}.png`)
    return true
  }
  catch (error) {
    console.error('Failed to fetch imported logo', error)
    toast.error(t('organization-onboarding-imported-logo-failed', 'Could not import logo from website'))
    return false
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
  try {
    await organizationStore.fetchOrganizations()
    if (activeOrgId.value)
      organizationStore.setCurrentOrganization(activeOrgId.value)
  }
  catch (error) {
    console.error('Failed to refresh organizations before finishing onboarding', error)
  }

  await router.push('/app/new')
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
    isLoadingWebsitePreview.value = false
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
      <InviteTeammateModal ref="inviteModalRef" @success="onInviteSuccess" />
      <input
        ref="logoInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onLogoSelected"
      >

      <div class="space-y-6">
        <div v-if="hasExistingOrganization" class="flex justify-start">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-sm p-2 text-slate-500 transition dark:text-white dark:hover:bg-slate-600 hover:bg-slate-300 hover:text-slate-600"
            :aria-label="t('button-back', 'Back')"
            @click="goBack"
          >
            <IconBack class="w-5 h-5 fill-current" />
            <span>{{ t('button-back', 'Back') }}</span>
          </button>
        </div>

        <div class="text-center">
          <p class="text-sm font-semibold tracking-[0.18em] uppercase text-azure-500">
            {{ onboardingBadge }}
          </p>
          <h1 class="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
            {{ onboardingTitle }}
          </h1>
          <p class="max-w-2xl mx-auto mt-3 text-base text-slate-600">
            {{ onboardingSubtitle }}
          </p>
        </div>

        <div class="flex flex-wrap justify-center gap-3">
          <div
            v-for="entry in onboardingSteps"
            :key="entry.id"
            class="rounded-full border px-4 py-2 text-sm font-medium transition"
            :class="[
              isStepActive(entry.id) ? 'border-slate-900 bg-slate-900 text-white' : '',
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
                  {{ t('organization-onboarding-question', 'How do you want to create the organization?') }}
                </p>
                <div class="flex flex-wrap gap-3 mt-4">
                  <button
                    class="d-btn"
                    :class="mode === 'website' ? 'd-btn-primary' : 'd-btn-outline'"
                    data-test="onboarding-mode-website"
                    @click="mode = 'website'"
                  >
                    {{ t('organization-onboarding-mode-website', 'Website auto import') }}
                  </button>
                  <button
                    class="d-btn"
                    :class="mode === 'name' ? 'd-btn-primary' : 'd-btn-outline'"
                    data-test="onboarding-mode-name"
                    @click="mode = 'name'"
                  >
                    {{ t('organization-onboarding-mode-name', 'Enter a name') }}
                  </button>
                </div>
              </div>

              <div v-if="mode === 'website'" class="grid gap-4 rounded-2xl border border-slate-200 p-4">
                <div>
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
                </div>
                <button
                  type="button"
                  class="d-btn d-btn-outline w-fit"
                  data-test="onboarding-import-website"
                  :disabled="isLoadingWebsitePreview || !websiteInput.trim()"
                  @click="fetchWebsitePreview"
                >
                  <IconLoader v-if="isLoadingWebsitePreview" class="w-4 h-4 animate-spin" />
                  <span v-else>{{ t('organization-onboarding-import-website', 'Import organization name and logo') }}</span>
                </button>
                <p class="text-xs text-slate-500">
                  {{ websitePreview
                    ? t('organization-onboarding-website-imported', 'Website assets imported. You can review the organization name before continuing.')
                    : t('organization-onboarding-website-help', 'Enter your company website to import the organization name and logo from its assets.') }}
                </p>
              </div>

              <div v-else-if="!mode" class="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                {{ t('organization-onboarding-choice-hint', 'Pick one path first. You can either import the name and logo from a website or type the organization name manually.') }}
              </div>

              <template v-if="canShowOrgDetails">
                <div>
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
                  <p v-if="mode === 'website'" class="mt-2 text-xs text-slate-500">
                    {{ importedLogoUrl
                      ? t('organization-onboarding-website-name-helper', 'Imported from your website. You can still edit the organization name before continuing.')
                      : t('organization-onboarding-website-name-helper-empty', 'Import from the website first, then review the generated organization name here.') }}
                  </p>
                </div>

                <div class="flex flex-wrap gap-3">
                  <button
                    type="button"
                    class="d-btn d-btn-primary"
                    data-test="onboarding-create-org"
                    :disabled="!canCreateOrganization"
                    @click="createOrganization"
                  >
                    <span v-if="!isSubmitting">
                      {{ isCompactCreateOrgFlow
                        ? t('organization-create-submit', 'Create organization')
                        : mode === 'website' && importedLogoUrl
                          ? t('organization-onboarding-continue-invite', 'Continue to invite users')
                          : t('organization-onboarding-continue-logo', 'Continue to logo') }}
                    </span>
                    <IconLoader v-else class="w-4 h-4 animate-spin" />
                  </button>
                  <button type="button" class="d-btn d-btn-outline" @click="goBack">
                    {{ t('cancel', 'Cancel') }}
                  </button>
                </div>
              </template>
            </div>

            <div class="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
              <div class="rounded-[24px] border border-white/10 bg-slate-900 p-5">
                <div class="flex items-center gap-4">
                  <div class="flex h-18 w-18 items-center justify-center overflow-hidden rounded-[22px] bg-slate-800 text-2xl font-semibold">
                    <img
                      v-if="importedLogoUrl || selectedLogoPreview || (currentOrganization?.gid === activeOrgId && currentOrganization?.logo)"
                      :src="(currentOrganization?.gid === activeOrgId ? currentOrganization.logo : '') || selectedLogoPreview || importedLogoUrl"
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
                      {{ mode === 'website'
                        ? t('organization-onboarding-mode-website', 'Website auto import')
                        : mode === 'name'
                          ? t('organization-onboarding-mode-name', 'Enter a name')
                          : t('organization-onboarding-no-choice', 'Not selected yet') }}
                    </div>
                  </div>
                  <div>
                    <div class="text-xs font-medium uppercase text-slate-500">
                      {{ t('organization-onboarding-next-steps', 'Next steps') }}
                    </div>
                    <ul class="mt-3 space-y-3">
                      <li class="flex gap-3">
                        <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {{ mode === 'website' && importedLogoUrl
                          ? t('organization-onboarding-next-invite-direct', '1. Review the imported organization and invite teammates')
                          : t('organization-onboarding-next-logo', '1. Save the organization logo') }}
                      </li>
                      <li class="flex gap-3">
                        <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {{ mode === 'website' && importedLogoUrl
                          ? t('organization-onboarding-next-create-app-direct', '2. Create your first app once the team is invited')
                          : t('organization-onboarding-next-invite', '2. Invite teammates') }}
                      </li>
                      <li class="flex gap-3">
                        <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {{ mode === 'website' && importedLogoUrl
                          ? t('organization-onboarding-next-assets-direct', '3. Update the logo later in settings if you want a different asset')
                          : t('organization-onboarding-next-create-app', '3. Create your first app') }}
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
                      v-if="currentOrganization?.gid === activeOrgId && currentOrganization?.logo"
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
                    ? t('organization-onboarding-invite-success-state', 'Invitations sent. You can keep inviting more users or create your first app.')
                    : t('organization-onboarding-invite-empty-state', 'No invitations sent yet.') }}
                </p>

                <ul v-if="inviteSuccessCount > 0" class="mt-4 space-y-3">
                  <li
                    v-for="invite in sentInvites"
                    :key="invite.email"
                    class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                      {{ getInviteInitials(invite) }}
                    </div>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-slate-900">
                        {{ getInviteDisplayName(invite) }}
                      </div>
                      <div class="truncate text-xs text-slate-500">
                        {{ invite.email }}
                      </div>
                    </div>
                  </li>
                </ul>
              </div>

              <div class="flex flex-wrap gap-3">
                <button type="button" class="d-btn d-btn-primary" data-test="onboarding-invite-users" @click="openInviteModal">
                  {{ t('organization-onboarding-open-invite', 'Invite users') }}
                </button>
                <button type="button" class="d-btn d-btn-outline" data-test="onboarding-finish" @click="finishOnboarding">
                  {{ t('organization-onboarding-create-app', 'Create app') }}
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
                    {{ t('organization-onboarding-after-create-app', 'The next step after this page is creating your first app.') }}
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
