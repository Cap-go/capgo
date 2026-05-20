<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconBuilding from '~icons/lucide/building-2'
import IconCheck from '~icons/lucide/check'
import IconLoader from '~icons/lucide/loader-2'
import IconUserPlus from '~icons/lucide/user-plus'
import IconX from '~icons/lucide/x'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

interface PendingInvitation {
  id: number
  org_id: string
  org_name: string
  org_logo: string | null
  role: string
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()

const invitations = ref<PendingInvitation[]>([])
const isLoading = ref(true)
const resolvingInvitationId = ref<number | null>(null)
const resolvingInvitationAction = ref<'accept' | 'decline' | null>(null)
const isDecliningAll = ref(false)
const errorMessage = ref('')

const hasMultipleInvitations = computed(() => invitations.value.length > 1)
const isResolvingInvitation = computed(() => resolvingInvitationId.value !== null || isDecliningAll.value)
const title = computed(() => hasMultipleInvitations.value
  ? t('pending-invite-title-multiple')
  : t('pending-invite-title'))
const subtitle = computed(() => hasMultipleInvitations.value
  ? t('pending-invite-subtitle-multiple')
  : t('pending-invite-subtitle'))
const targetPath = computed(() => {
  const target = typeof route.query.to === 'string' ? route.query.to : ''
  const isOnboardingTarget = /^\/onboarding(?:\/|\?|$)/.test(target)
  if (target.startsWith('/') && !isOnboardingTarget)
    return target
  return '/dashboard'
})

async function continueAfterInvitationsResolved() {
  await organizationStore.dedupFetchOrganizations()

  if (organizationStore.hasOrganizations) {
    await router.replace(targetPath.value)
    return
  }

  await router.replace({
    path: '/onboarding/organization',
    query: {
      to: targetPath.value,
    },
  })
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts[1]?.[0] ?? '') : (parts[0]?.[1] ?? '')
  return (first + second).toUpperCase() || 'CG'
}

async function loadPendingInvitations() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const { data, error } = await supabase.functions.invoke('private/pending_invitations', {
      method: 'GET',
    })

    if (error)
      throw error

    invitations.value = data?.invitations ?? []
    if (invitations.value.length === 0) {
      await continueAfterInvitationsResolved()
    }
  }
  catch (error) {
    console.error('Failed to load pending organization invitations', error)
    errorMessage.value = t('pending-invite-load-failed')
  }
  finally {
    isLoading.value = false
  }
}

async function resolveInvitation(invitation: PendingInvitation, action: 'accept' | 'decline') {
  resolvingInvitationId.value = invitation.id
  resolvingInvitationAction.value = action
  errorMessage.value = ''
  try {
    const { data, error } = await supabase.functions.invoke('private/pending_invitations', {
      body: {
        action,
        invitation_id: invitation.id,
      },
    })

    if (error)
      throw error

    if (action === 'accept') {
      await organizationStore.fetchOrganizations()
      if (data?.accepted_org_id)
        organizationStore.setCurrentOrganization(data.accepted_org_id)

      toast.success(t('pending-invite-joined'))
    }
    else {
      toast.success(t('pending-invite-declined'))
    }

    invitations.value = invitations.value.filter(item => item.id !== invitation.id)
    if (invitations.value.length === 0)
      await continueAfterInvitationsResolved()
  }
  catch (error) {
    console.error(`Failed to ${action} pending organization invitation`, error)
    errorMessage.value = t(action === 'accept' ? 'pending-invite-join-failed' : 'pending-invite-decline-failed')
  }
  finally {
    resolvingInvitationId.value = null
    resolvingInvitationAction.value = null
  }
}

async function declineAllInvitations() {
  isDecliningAll.value = true
  errorMessage.value = ''
  try {
    const { error } = await supabase.functions.invoke('private/pending_invitations', {
      body: {
        action: 'decline_all',
      },
    })

    if (error)
      throw error

    invitations.value = []
    toast.success(t('pending-invite-declined'))
    await continueAfterInvitationsResolved()
  }
  catch (error) {
    console.error('Failed to decline pending organization invitations', error)
    errorMessage.value = t('pending-invite-decline-failed')
  }
  finally {
    isDecliningAll.value = false
  }
}

onMounted(async () => {
  displayStore.NavTitle = t('pending-invite-title')
  await loadPendingInvitations()
})
</script>

<template>
  <section class="min-h-screen overflow-y-auto bg-slate-950 text-slate-100">
    <div class="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8 sm:px-8 lg:px-10">
      <div class="flex flex-1 items-center justify-center py-8">
        <div class="w-full max-w-5xl">
          <div class="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200">
            <IconUserPlus class="h-4 w-4 text-slate-300" />
            {{ t('pending-invite-badge') }}
          </div>

          <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            <div>
              <h1 class="text-4xl font-bold tracking-normal text-white sm:text-5xl">
                {{ title }}
              </h1>
              <p class="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
                {{ subtitle }}
              </p>

              <div class="mt-8">
                <div v-if="isLoading" class="flex min-h-48 items-center justify-center">
                  <IconLoader class="h-6 w-6 animate-spin text-slate-300" />
                  <span class="sr-only">{{ t('loading') }}</span>
                </div>

                <div v-else class="space-y-4">
                  <p v-if="errorMessage" class="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {{ errorMessage }}
                  </p>

                  <article
                    v-for="invitation in invitations"
                    :key="invitation.id"
                    class="rounded-lg border border-white/15 bg-slate-950/80 p-4"
                  >
                    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div class="flex min-w-0 items-center gap-4">
                        <img
                          v-if="invitation.org_logo"
                          :src="invitation.org_logo"
                          :alt="t('pending-invite-logo-alt', { name: invitation.org_name })"
                          class="h-14 w-14 shrink-0 rounded-lg border border-white/15 object-cover"
                        >
                        <div v-else class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary-500/20 text-lg font-bold text-white">
                          {{ getInitials(invitation.org_name) }}
                        </div>

                        <div class="min-w-0">
                          <h2 class="truncate text-xl font-semibold text-white">
                            {{ invitation.org_name }}
                          </h2>
                          <p class="mt-1 text-sm text-slate-400">
                            {{ t('pending-invite-card-copy') }}
                          </p>
                        </div>
                      </div>

                      <div class="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          class="d-btn min-h-11 border-white/15 bg-white/5 text-slate-100 hover:border-white/25 hover:bg-white/10 disabled:border-white/10 disabled:bg-slate-900 disabled:text-slate-500"
                          :disabled="isResolvingInvitation"
                          data-test="pending-invite-decline"
                          @click="resolveInvitation(invitation, 'decline')"
                        >
                          <IconLoader v-if="resolvingInvitationId === invitation.id && resolvingInvitationAction === 'decline'" class="h-4 w-4 animate-spin" />
                          <IconX v-else class="h-4 w-4" />
                          {{ t('pending-invite-decline') }}
                        </button>

                        <button
                          type="button"
                          class="d-btn min-h-11 border-primary-500 bg-primary-500 text-white hover:border-primary-500 hover:bg-primary-500/90 disabled:border-white/15 disabled:bg-slate-800 disabled:text-slate-500"
                          :disabled="isResolvingInvitation"
                          data-test="pending-invite-join"
                          @click="resolveInvitation(invitation, 'accept')"
                        >
                          <IconLoader v-if="resolvingInvitationId === invitation.id && resolvingInvitationAction === 'accept'" class="h-4 w-4 animate-spin" />
                          <IconCheck v-else class="h-4 w-4" />
                          {{ t('pending-invite-join') }}
                        </button>
                      </div>
                    </div>
                  </article>
                </div>
              </div>

              <div v-if="!isLoading && hasMultipleInvitations" class="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  class="d-btn min-h-11 border-white/15 bg-white/5 text-slate-100 hover:border-white/25 hover:bg-white/10 disabled:border-white/10 disabled:bg-slate-900 disabled:text-slate-500"
                  :disabled="isResolvingInvitation"
                  data-test="pending-invite-decline-all"
                  @click="declineAllInvitations"
                >
                  <IconLoader v-if="isDecliningAll" class="h-4 w-4 animate-spin" />
                  <IconX v-else class="h-4 w-4" />
                  {{ t('pending-invite-create-org') }}
                </button>
              </div>
            </div>

            <aside class="rounded-lg border border-white/15 bg-slate-900/80 p-6">
              <div class="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-800 text-slate-200">
                <IconBuilding class="h-7 w-7" />
              </div>
              <h2 class="mt-5 text-sm font-semibold uppercase text-slate-400">
                {{ t('pending-invite-summary') }}
              </h2>
              <p class="mt-2 text-2xl font-semibold text-white">
                {{ t('pending-invite-summary-title') }}
              </p>
              <div class="mt-6 space-y-4 border-t border-white/10 pt-5 text-sm text-slate-300">
                <div class="flex gap-3">
                  <IconCheck class="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{{ t('pending-invite-summary-join') }}</span>
                </div>
                <div class="flex gap-3">
                  <IconArrowRight class="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>{{ t('pending-invite-summary-create') }}</span>
                </div>
              </div>
            </aside>
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
