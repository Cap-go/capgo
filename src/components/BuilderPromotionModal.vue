<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconChevronDown from '~icons/lucide/chevron-down'
import IconCloudCog from '~icons/lucide/cloud-cog'
import IconHistory from '~icons/lucide/history'
import IconShieldCheck from '~icons/lucide/shield-check'
import IconSparkles from '~icons/lucide/sparkles'
import IconTerminal from '~icons/lucide/terminal-square'
import IconX from '~icons/lucide/x'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

interface BuilderPromotionMetadata {
  dismissed?: boolean
  lastShownAt?: string
}

const PROMOTION_METADATA_KEY = 'capgo_builder_promotion'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const PROMOTION_PATHS = new Set(['/apps', '/dashboard'])
const EXCLUDED_PATH_PREFIXES = [
  '/login',
  '/register',
  '/forgot_password',
  '/confirm-signup',
  '/sso-callback',
  '/onboarding',
  '/invitation',
  '/accountDisabled',
  '/delete_account',
]

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const supabase = useSupabase()
const main = useMainStore()
const organizationStore = useOrganizationStore()

const open = ref(false)
const isChecking = ref(false)
const isSaving = ref(false)
const targetPath = ref('/apps')
const lastEvaluationKey = ref('')
const laterButton = ref<HTMLButtonElement | null>(null)

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getPromotionMetadata(): BuilderPromotionMetadata {
  const metadata = (main.auth?.user_metadata ?? {}) as Record<string, unknown>
  const raw = metadata[PROMOTION_METADATA_KEY]

  if (!isObjectRecord(raw))
    return {}

  return {
    dismissed: raw.dismissed === true,
    lastShownAt: typeof raw.lastShownAt === 'string' ? raw.lastShownAt : undefined,
  }
}

function shouldShowByCadence(metadata: BuilderPromotionMetadata) {
  if (metadata.dismissed)
    return false
  if (!metadata.lastShownAt)
    return true

  const lastShownAt = new Date(metadata.lastShownAt).getTime()
  return Number.isNaN(lastShownAt) || Date.now() - lastShownAt >= WEEK_MS
}

function isRouteExcluded() {
  return EXCLUDED_PATH_PREFIXES.some(prefix => route.path === prefix || route.path.startsWith(`${prefix}/`))
}

function isPromotionRoute() {
  return PROMOTION_PATHS.has(route.path)
}

function hasRestrictedCurrentOrganization() {
  const org = organizationStore.currentOrganization
  const lacks2FAAccess = org?.enforcing_2fa === true && org?.['2fa_has_access'] === false
  const lacksPasswordAccess = org?.password_policy_config?.enabled === true && org?.password_has_access === false
  return organizationStore.currentOrganizationFailed || lacks2FAAccess || lacksPasswordAccess
}

function getSelectableOrgIds() {
  return organizationStore.organizations
    .filter(org => !org.role.includes('invite'))
    .map(org => org.gid)
}

async function hasAnyBuilderActivity(orgIds: string[]) {
  const { data, error } = await supabase
    .from('build_requests')
    .select('id')
    .in('owner_org', orgIds)
    .limit(1)

  if (error) {
    console.error('Cannot check builder promotion state', error)
    return true
  }

  return (data?.length ?? 0) > 0
}

async function resolveBuilderTargetPath(orgIds: string[]) {
  const currentOrgId = organizationStore.currentOrganization?.gid
  let query = supabase
    .from('apps')
    .select('app_id')
    .limit(1)

  query = currentOrgId
    ? query.eq('owner_org', currentOrgId)
    : query.in('owner_org', orgIds)

  const { data, error } = await query
  if (error) {
    console.error('Cannot resolve builder promotion target', error)
    return '/apps'
  }

  const appId = data?.[0]?.app_id
  return appId ? `/app/${appId}/builds` : '/app/new'
}

async function savePromotionMetadata(patch: BuilderPromotionMetadata) {
  if (!main.auth)
    return false

  const currentMetadata = (main.auth.user_metadata ?? {}) as Record<string, unknown>
  const nextPromotionMetadata = {
    ...getPromotionMetadata(),
    ...patch,
  }
  const { data, error } = await supabase.auth.updateUser({
    data: {
      ...currentMetadata,
      [PROMOTION_METADATA_KEY]: nextPromotionMetadata,
    },
  })

  if (error) {
    console.error('Cannot update builder promotion preference', error)
    toast.error(t('builder-promo-save-error'))
    return false
  }

  if (data.user)
    main.auth = data.user

  return true
}

async function remindLater() {
  if (isSaving.value)
    return

  isSaving.value = true
  try {
    const saved = await savePromotionMetadata({ lastShownAt: new Date().toISOString() })
    if (saved)
      open.value = false
  }
  finally {
    isSaving.value = false
  }
}

async function neverShowAgain() {
  if (isSaving.value)
    return

  isSaving.value = true
  try {
    const saved = await savePromotionMetadata({ dismissed: true, lastShownAt: new Date().toISOString() })
    if (saved)
      open.value = false
  }
  finally {
    isSaving.value = false
  }
}

async function openBuilderSetup() {
  if (isSaving.value)
    return

  isSaving.value = true
  await savePromotionMetadata({ lastShownAt: new Date().toISOString() })
  isSaving.value = false
  open.value = false
  await router.push(targetPath.value)
}

async function maybeOpenModal() {
  if (open.value || isChecking.value)
    return
  if (!main.auth?.id || !main.user?.id || isRouteExcluded() || !isPromotionRoute())
    return

  isChecking.value = true
  try {
    await organizationStore.awaitInitialLoad()

    if (isRouteExcluded() || !isPromotionRoute() || hasRestrictedCurrentOrganization())
      return

    const orgIds = getSelectableOrgIds()
    if (orgIds.length === 0)
      return

    const metadata = getPromotionMetadata()
    const evaluationKey = [
      main.auth.id,
      orgIds.join(','),
      String(metadata.dismissed),
      metadata.lastShownAt ?? '',
    ].join(':')

    if (lastEvaluationKey.value === evaluationKey)
      return

    lastEvaluationKey.value = evaluationKey

    if (!shouldShowByCadence(metadata))
      return

    if (await hasAnyBuilderActivity(orgIds))
      return

    targetPath.value = await resolveBuilderTargetPath(orgIds)
    open.value = true
  }
  catch (error) {
    console.error('Cannot load organizations for builder promotion', error)
  }
  finally {
    isChecking.value = false
  }
}

watch(
  [
    () => main.auth?.id,
    () => main.user?.id,
    () => main.auth?.user_metadata?.[PROMOTION_METADATA_KEY],
    () => organizationStore.currentOrganization?.gid,
    () => organizationStore.organizations.length,
    () => organizationStore.currentOrganizationFailed,
    () => route.path,
  ],
  () => {
    void maybeOpenModal()
  },
  { immediate: true },
)

watch(open, async (visible) => {
  if (!visible)
    return
  await nextTick()
  laterButton.value?.focus()
})

watch(
  () => route.path,
  () => {
    if (open.value && !isPromotionRoute())
      open.value = false
  },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      @keydown.esc.prevent="remindLater"
    >
      <div
        class="absolute inset-0 h-full w-full cursor-default"
        aria-hidden="true"
        @click="remindLater"
      />

      <dialog
        open
        aria-labelledby="builder-promo-title"
        class="relative m-0 max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-0 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        @cancel.prevent="remindLater"
      >
        <button
          type="button"
          class="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          :aria-label="t('builder-promo-later')"
          :disabled="isSaving"
          @click="remindLater"
        >
          <IconX class="h-5 w-5" />
        </button>

        <div class="border-b border-slate-200 bg-slate-950 p-6 text-white dark:border-slate-700">
          <div class="flex items-center gap-2 text-sm font-medium text-azure-200">
            <IconSparkles class="h-4 w-4" />
            {{ t('builder-promo-kicker') }}
          </div>
          <h2 id="builder-promo-title" class="mt-3 max-w-md text-2xl font-semibold leading-tight sm:text-3xl">
            {{ t('builder-promo-title') }}
          </h2>
          <p class="mt-3 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">
            {{ t('builder-promo-description') }}
          </p>
        </div>

        <div class="space-y-5 p-6">
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
              <IconCloudCog class="h-6 w-6 text-azure-500" />
              <h3 class="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
                {{ t('builder-promo-cloud-title') }}
              </h3>
              <p class="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
                {{ t('builder-promo-cloud-description') }}
              </p>
            </div>

            <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
              <IconShieldCheck class="h-6 w-6 text-emerald-500" />
              <h3 class="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
                {{ t('builder-promo-signing-title') }}
              </h3>
              <p class="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
                {{ t('builder-promo-signing-description') }}
              </p>
            </div>

            <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
              <IconHistory class="h-6 w-6 text-amber-500" />
              <h3 class="mt-3 text-sm font-semibold text-slate-950 dark:text-white">
                {{ t('builder-promo-history-title') }}
              </h3>
              <p class="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
                {{ t('builder-promo-history-description') }}
              </p>
            </div>
          </div>

          <div class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              class="d-btn d-btn-primary min-h-12 gap-2"
              :disabled="isSaving"
              @click="openBuilderSetup"
            >
              <IconTerminal class="h-5 w-5" />
              {{ t('builder-promo-setup') }}
            </button>
            <button
              ref="laterButton"
              type="button"
              class="d-btn d-btn-outline min-h-12 border-slate-300 px-8 text-slate-700 dark:border-slate-600 dark:text-slate-100"
              :disabled="isSaving"
              @click="remindLater"
            >
              {{ t('builder-promo-later') }}
            </button>
          </div>

          <details class="group w-fit text-sm text-slate-500 dark:text-slate-400">
            <summary class="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md px-1 underline-offset-4 hover:text-slate-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500 dark:hover:text-slate-200">
              {{ t('builder-promo-more-options') }}
              <IconChevronDown class="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <button
              type="button"
              class="mt-1 min-h-11 rounded-md px-1 text-left text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500 dark:text-slate-400 dark:hover:text-slate-200"
              :disabled="isSaving"
              @click="neverShowAgain"
            >
              {{ t('builder-promo-never') }}
            </button>
          </details>
        </div>
      </dialog>
    </div>
  </Teleport>
</template>
