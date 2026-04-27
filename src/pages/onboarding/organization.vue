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
const isLoggingOut = ref(false)
const selectedLogoPreview = ref('')
const sentInvites = ref<SentInvite[]>([])
const websitePreview = ref<WebsitePreview | null>(null)
const inviteModalRef = ref<InviteTeammateModalRef | null>(null)
const logoInputRef = useTemplateRef<HTMLInputElement>('logoInput')
const isAdditionalOrgFlow = ref(false)

const onboardingSteps: Array<{ id: OnboardingStep, label: string }> = [
  { id: 'details', label: t('organization-onboarding-step-details') },
  { id: 'logo', label: t('organization-onboarding-step-logo') },
  { id: 'invite', label: t('organization-onboarding-step-invite') },
]

const activeOrgId = computed(() => createdOrgId.value || '')
const activeOrgName = computed(() => {
  if (currentOrganization.value?.gid === activeOrgId.value)
    return currentOrganization.value.name
  return orgNameInput.value.trim() || websitePreview.value?.name || ''
})
const hasSavedLogo = computed(() => currentOrganization.value?.gid === activeOrgId.value && !!currentOrganization.value.logo)

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
  ? t('organization-create-badge')
  : t('organization-onboarding-badge'))
const onboardingTitle = computed(() => isCompactCreateOrgFlow.value
  ? t('organization-create-title')
  : t('organization-onboarding-title'))
const onboardingSubtitle = computed(() => isCompactCreateOrgFlow.value
  ? t('organization-create-subtitle')
  : t('organization-onboarding-subtitle'))

function whiteCardToggleButtonClass(active: boolean) {
  return active
    ? 'border-slate-900 bg-slate-900 text-white hover:border-slate-800 hover:bg-slate-800'
    : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
}

function whiteCardSecondaryButtonClass() {
  return 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100'
}

function whiteCardPrimaryButtonClass() {
  return 'border-slate-900 bg-slate-900 text-white hover:border-slate-800 hover:bg-slate-800 disabled:border-slate-300 disabled:bg-slate-300 disabled:text-white disabled:opacity-100'
}

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

async function logoutFromOnboarding() {
  if (isLoggingOut.value)
    return

  isLoggingOut.value = true

  try {
    await main.logout()
    await router.replace('/login')
  }
  catch (error) {
    console.error('Failed to log out from organization onboarding', error)
    toast.error(t('cannot-sign-off'))
  }
  finally {
    isLoggingOut.value = false
  }
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
    toast.error(t('organization-onboarding-website-invalid'))
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
      toast.error(t('organization-onboarding-website-fetch-failed'))
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
    toast.error(t('organization-onboarding-mode-required'))
    return
  }

  const orgName = orgNameInput.value.trim()
  if (!orgName) {
    toast.error(t('org-name-required'))
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
        ? t('org-with-this-name-exists')
        : t('cannot-create-org'))
      return
    }

    createdOrgId.value = data.id
    toast.success(t('org-created-successfully'))

    try {
      await organizationStore.fetchOrganizations()
      organizationStore.setCurrentOrganization(data.id)
    }
    catch (error) {
      console.error('Failed to refresh organizations after onboarding create', error)
      toast.error(t('organization-onboarding-refresh-failed'))
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
    toast.error(t('organization-not-found'))
    return
  }

  isUploadingLogo.value = true
  try {
    await uploadOrgLogoFile(orgId, blob, filename)
    step.value = 'invite'
    toast.success(t('organization-onboarding-logo-saved'))
    await syncRouteQuery('invite', orgId)
  }
  catch (error) {
    console.error('Failed to upload organization logo during onboarding', error)
    toast.error(t('something-went-wrong-try-again-later'))
  }
  finally {
    isUploadingLogo.value = false
  }
}

async function useImportedLogo() {
  if (!importedLogoUrl.value) {
    toast.error(t('organization-onboarding-imported-logo-unavailable'))
    return false
  }

  try {
    if (importedLogoUrl.value.startsWith('data:')) {
      const [header, payload = ''] = importedLogoUrl.value.split(',', 2)
      const contentType = header.match(/^data:([^;]+)/)?.[1] ?? ''
      if (!contentType.startsWith('image/') || !payload) {
        toast.error(t('organization-onboarding-imported-logo-failed'))
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
      toast.error(t('organization-onboarding-imported-logo-failed'))
      return false
    }
    const blob = await response.blob()
    await uploadLogoBlob(blob, `${websiteHostname.value || 'website-logo'}.png`)
    return true
  }
  catch (error) {
    console.error('Failed to fetch imported logo', error)
    toast.error(t('organization-onboarding-imported-logo-failed'))
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
    toast.error(t('organization-not-found'))
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
  displayStore.NavTitle = t('organization-onboarding-title')
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
        <div class="flex items-center justify-between gap-3">
          <button
            v-if="hasExistingOrganization"
            type="button"
            class="inline-flex items-center gap-1 rounded-sm p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/8 dark:hover:text-white"
            :aria-label="t('button-back')"
            @click="goBack"
          >
            <IconBack class="w-5 h-5 fill-current" />
            <span>{{ t('button-back') }}</span>
          </button>

          <button
            type="button"
            class="d-btn d-btn-ghost ml-auto text-slate-600 hover:text-slate-900"
            data-test="onboarding-logout"
            :aria-label="t('logout')"
            :disabled="isLoggingOut"
            @click="logoutFromOnboarding"
          >
            <IconLoader v-if="isLoggingOut" class="w-4 h-4 animate-spin" />
            <span :class="{ 'sr-only': isLoggingOut }">{{ t('logout') }}</span>
          </button>
        </div>

        <div class="text-center">
          <p class="text-sm font-semibold tracking-[0.18em] uppercase text-azure-500">
            {{ onboardingBadge }}
          </p>
          <h1 class="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl dark:text-slate-50">
            {{ onboardingTitle }}
          </h1>
          <p class="max-w-2xl mx-auto mt-3 text-base text-slate-600 dark:text-slate-300">
            {{ onboardingSubtitle }}
          </p>
        </div>

        <div class="flex flex-wrap justify-center gap-3">
          <div
            v-for="entry in onboardingSteps"
            :key="entry.id"
            class="rounded-full border px-5 py-2.5 text-sm font-medium transition-all duration-200"
            :class="[
              isStepActive(entry.id) ? 'border-white bg-white text-azure-600 shadow-sm ring-2 ring-azure-400/35' : '',
              !isStepActive(entry.id) && isStepDone(entry.id) ? 'border-white/75 bg-white/92 text-slate-700 shadow-sm' : '',
              !isStepActive(entry.id) && !isStepDone(entry.id) ? 'border-white/70 bg-white/88 text-slate-500 shadow-sm' : '',
            ]"
          >
            {{ entry.label }}
          </div>
        </div>

        <div v-if="step === 'details'" class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-200 dark:bg-white">
          <div class="grid gap-6 md:grid-cols-[1.25fr_0.9fr]">
            <div class="space-y-5">
              <div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-200 dark:bg-slate-50/70">
                <p class="text-sm font-medium text-slate-900 dark:text-slate-900">
                  {{ t('organization-onboarding-question') }}
                </p>
                <div class="flex flex-wrap gap-3 mt-4">
                  <button
                    class="d-btn"
                    :class="whiteCardToggleButtonClass(mode === 'website')"
                    data-test="onboarding-mode-website"
                    @click="mode = 'website'"
                  >
                    {{ t('organization-onboarding-mode-website') }}
                  </button>
                  <button
                    class="d-btn"
                    :class="whiteCardToggleButtonClass(mode === 'name')"
                    data-test="onboarding-mode-name"
                    @click="mode = 'name'"
                  >
                    {{ t('organization-onboarding-mode-name') }}
                  </button>
                </div>
              </div>

              <div v-if="mode === 'website'" class="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-200 dark:bg-slate-50/70">
                <div>
                  <label class="text-sm font-medium text-slate-800 dark:text-slate-800">
                    {{ t('organization-onboarding-website-label') }}
                  </label>
                  <input
                    v-model="websiteInput"
                    type="url"
                    placeholder="https://capgo.app"
                    data-test="onboarding-website"
                    class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-azure-400 focus:ring-2 focus:ring-azure-100 dark:border-slate-300 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-400 dark:focus:border-azure-400 dark:focus:ring-azure-100"
                  >
                </div>
                <button
                  type="button"
                  class="d-btn w-fit"
                  :class="whiteCardSecondaryButtonClass()"
                  data-test="onboarding-import-website"
                  :disabled="isLoadingWebsitePreview || !websiteInput.trim()"
                  @click="fetchWebsitePreview"
                >
                  <IconLoader v-if="isLoadingWebsitePreview" class="w-4 h-4 animate-spin" />
                  <span v-else>{{ t('organization-onboarding-import-website') }}</span>
                </button>
                <p class="text-xs text-slate-500 dark:text-slate-500">
                  {{ websitePreview
                    ? t('organization-onboarding-website-imported')
                    : t('organization-onboarding-website-help') }}
                </p>
              </div>

              <div v-else-if="!mode" class="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-300 dark:text-slate-500">
                {{ t('organization-onboarding-choice-hint') }}
              </div>

              <template v-if="canShowOrgDetails">
                <div>
                  <label class="text-sm font-medium text-slate-800 dark:text-slate-800">
                    {{ t('organization-name') }}
                  </label>
                  <input
                    v-model="orgNameInput"
                    type="text"
                    :placeholder="t('organization-name')"
                    data-test="onboarding-org-name"
                    class="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-azure-400 focus:ring-2 focus:ring-azure-100 dark:border-slate-300 dark:bg-white dark:text-slate-900 dark:placeholder:text-slate-400 dark:focus:border-azure-400 dark:focus:ring-azure-100"
                  >
                  <p v-if="mode === 'website'" class="mt-2 text-xs text-slate-500 dark:text-slate-500">
                    {{ importedLogoUrl
                      ? t('organization-onboarding-website-name-helper')
                      : t('organization-onboarding-website-name-helper-empty') }}
                  </p>
                </div>

                <div class="flex flex-wrap gap-3">
                  <button
                    type="button"
                    class="d-btn"
                    :class="whiteCardPrimaryButtonClass()"
                    data-test="onboarding-create-org"
                    :disabled="!canCreateOrganization"
                    @click="createOrganization"
                  >
                    <span v-if="!isSubmitting">
                      {{ isCompactCreateOrgFlow
                        ? t('organization-create-submit')
                        : mode === 'website' && importedLogoUrl
                          ? t('organization-onboarding-continue-invite')
                          : t('organization-onboarding-continue-logo') }}
                    </span>
                    <IconLoader v-else class="w-4 h-4 animate-spin" />
                  </button>
                  <button type="button" class="d-btn" :class="whiteCardSecondaryButtonClass()" @click="goBack">
                    {{ t('cancel') }}
                  </button>
                </div>
              </template>
            </div>

            <div class="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
              <div class="rounded-3xl border border-white/10 bg-slate-900 p-5">
                <div class="flex items-center gap-4">
                  <div class="flex h-18 w-18 items-center justify-center overflow-hidden rounded-[22px] bg-slate-800 text-2xl font-semibold">
                    <img
                      v-if="importedLogoUrl || selectedLogoPreview || (currentOrganization?.gid === activeOrgId && currentOrganization?.logo)"
                      :src="(currentOrganization?.gid === activeOrgId ? currentOrganization.logo : '') || selectedLogoPreview || importedLogoUrl"
                      :alt="t('organization-onboarding-logo-preview-alt', { name: activeOrgName || t('organization-onboarding-org-placeholder') })"
                      class="h-full w-full object-cover"
                    >
                    <span v-else>{{ (activeOrgName || 'O').slice(0, 2).toUpperCase() }}</span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {{ t('organization-onboarding-summary') }}
                    </p>
                    <p class="truncate text-lg font-semibold">
                      {{ activeOrgName || t('organization-onboarding-org-placeholder') }}
                    </p>
                    <p class="mt-1 truncate text-xs text-slate-400">
                      {{ websiteHostname || t('organization-onboarding-mode-name') }}
                    </p>
                  </div>
                </div>

                <div class="mt-6 space-y-4 text-sm text-slate-300">
                  <div>
                    <div class="text-xs font-medium uppercase text-slate-500">
                      {{ t('organization-onboarding-selected-path') }}
                    </div>
                    <div class="mt-1 text-base text-white">
                      {{ mode === 'website'
                        ? t('organization-onboarding-mode-website')
                        : mode === 'name'
                          ? t('organization-onboarding-mode-name')
                          : t('organization-onboarding-no-choice') }}
                    </div>
                  </div>
                  <div>
                    <div class="text-xs font-medium uppercase text-slate-500">
                      {{ t('organization-onboarding-next-steps') }}
                    </div>
                    <ul class="mt-3 space-y-3">
                      <li class="flex gap-3">
                        <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {{ mode === 'website' && importedLogoUrl
                          ? t('organization-onboarding-next-invite-direct')
                          : t('organization-onboarding-next-logo') }}
                      </li>
                      <li class="flex gap-3">
                        <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {{ mode === 'website' && importedLogoUrl
                          ? t('organization-onboarding-next-create-app-direct')
                          : t('organization-onboarding-next-invite') }}
                      </li>
                      <li class="flex gap-3">
                        <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        {{ mode === 'website' && importedLogoUrl
                          ? t('organization-onboarding-next-assets-direct')
                          : t('organization-onboarding-next-create-app') }}
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
                  {{ t('organization-onboarding-step-logo') }}
                </p>
                <h2 class="mt-2 text-2xl font-semibold text-slate-900">
                  {{ t('organization-onboarding-logo-title') }}
                </h2>
                <p class="mt-2 text-sm text-slate-600">
                  {{ t('organization-onboarding-logo-subtitle') }}
                </p>
              </div>

              <div class="rounded-2xl border border-slate-200 p-5">
                <div class="flex items-center gap-4">
                  <div class="flex h-18 w-18 items-center justify-center overflow-hidden rounded-[22px] bg-slate-800 text-2xl font-semibold text-white">
                    <img
                      v-if="currentOrganization?.gid === activeOrgId && currentOrganization?.logo"
                      :src="currentOrganization.logo"
                      :alt="t('organization-onboarding-logo-alt', { name: activeOrgName || t('organization-onboarding-org-placeholder') })"
                      class="object-cover w-20 h-20 rounded-2xl"
                    >
                    <img
                      v-else-if="selectedLogoPreview"
                      :src="selectedLogoPreview"
                      :alt="t('organization-onboarding-logo-preview-alt', { name: activeOrgName || t('organization-onboarding-org-placeholder') })"
                      class="object-cover w-20 h-20 rounded-2xl"
                    >
                    <span v-else>{{ (activeOrgName || 'O').slice(0, 2).toUpperCase() }}</span>
                  </div>
                  <div>
                    <div class="text-lg font-semibold text-slate-900">
                      {{ activeOrgName || t('organization-onboarding-org-placeholder') }}
                    </div>
                    <div class="text-sm text-slate-500">
                      {{ t('organization-onboarding-logo-helper') }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <button type="button" class="d-btn d-btn-primary" data-test="onboarding-upload-logo" :disabled="isUploadingLogo" @click="openLogoPicker">
                  {{ t('organization-onboarding-upload-logo') }}
                </button>
                <button
                  v-if="importedLogoUrl"
                  type="button"
                  class="d-btn d-btn-secondary"
                  data-test="onboarding-use-imported-logo"
                  :disabled="isUploadingLogo"
                  @click="useImportedLogo"
                >
                  {{ t('organization-onboarding-use-imported-logo') }}
                </button>
                <button
                  type="button"
                  class="d-btn"
                  :class="hasSavedLogo ? 'd-btn-secondary' : 'd-btn-ghost'"
                  data-test="onboarding-logo-action"
                  :disabled="isUploadingLogo"
                  @click="skipLogo"
                >
                  {{ hasSavedLogo ? t('button-next') : t('skip') }}
                </button>
              </div>
              <p v-if="hasSavedLogo" class="text-sm font-medium text-emerald-600">
                {{ t('organization-onboarding-logo-saved') }}
              </p>
            </div>

            <div class="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
              <div class="rounded-3xl border border-white/10 bg-slate-900 p-5">
                <p class="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {{ t('organization-onboarding-import-preview') }}
                </p>
                <div class="mt-4 flex items-center gap-4">
                  <img
                    v-if="importedLogoUrl"
                    :src="importedLogoUrl"
                    :alt="t('organization-onboarding-imported-logo-preview-alt')"
                    class="h-16 w-16 rounded-2xl border border-white/10 object-cover"
                  >
                  <div v-else class="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/40 text-xs text-slate-400">
                    {{ t('organization-onboarding-no-logo') }}
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-white">
                      {{ activeOrgName || t('organization-onboarding-org-placeholder') }}
                    </p>
                    <p class="mt-1 truncate text-xs text-slate-400">
                      {{ websiteHostname || t('organization-onboarding-mode-name') }}
                    </p>
                  </div>
                </div>

                <ul class="mt-6 space-y-3 text-sm text-slate-300">
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('organization-onboarding-logo-tip-upload') }}
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('organization-onboarding-logo-tip-skip') }}
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
                  {{ t('organization-onboarding-step-invite') }}
                </p>
                <h2 class="mt-2 text-2xl font-semibold text-slate-900">
                  {{ t('organization-onboarding-invite-title') }}
                </h2>
                <p class="mt-2 text-sm text-slate-600">
                  {{ t('organization-onboarding-invite-subtitle') }}
                </p>
              </div>

              <div class="rounded-2xl border border-slate-200 p-5">
                <div class="text-base font-semibold text-slate-900">
                  {{ activeOrgName || t('organization-onboarding-org-placeholder') }}
                </div>
                <p class="mt-2 text-sm text-slate-500">
                  {{ inviteSuccessCount > 0
                    ? t('organization-onboarding-invite-success-state')
                    : t('organization-onboarding-invite-empty-state') }}
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
                  {{ t('organization-onboarding-open-invite') }}
                </button>
                <button type="button" class="d-btn d-btn-outline" data-test="onboarding-finish" @click="finishOnboarding">
                  {{ t('organization-onboarding-create-app') }}
                </button>
              </div>
            </div>

            <div class="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white">
              <div class="rounded-3xl border border-white/10 bg-slate-900 p-5">
                <p class="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {{ t('organization-onboarding-what-next') }}
                </p>
                <ul class="mt-6 space-y-3 text-sm text-slate-300">
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('organization-onboarding-after-invite-1') }}
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('organization-onboarding-after-invite-2') }}
                  </li>
                  <li class="flex gap-3">
                    <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {{ t('organization-onboarding-after-create-app') }}
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
