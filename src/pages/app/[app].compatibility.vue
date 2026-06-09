<script setup lang="ts">
import type { CompatibilityEventGroup, CompatibilityEventRow } from '~/services/compatibilityEvents'
import type { Database } from '~/types/supabase.types'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconArrowRight from '~icons/lucide/arrow-right'
import IconCheckCircle from '~icons/lucide/check-circle'
import IconExternalLink from '~icons/lucide/external-link'
import { dependencyDiffPath, groupCompatibilityEvents, platformLabel } from '~/services/compatibilityEvents'
import { formatLocalDateTime } from '~/services/date'
import { createSignedImageUrl } from '~/services/storage'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
// The router does not yet generate a typed route for this new page, so use the
// untyped useRoute() (matching the dependencies page) until the route map updates.
const route = useRoute()
const router = useRouter()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const dialogStore = useDialogV2Store()

const id = ref('')
const lastPath = ref('')
const isLoading = ref(false)
const app = ref<Database['public']['Tables']['apps']['Row']>()
const events = ref<CompatibilityEventRow[]>([])
const existingChannelIds = ref<Set<number>>(new Set())
const existingVersionIds = ref<Set<number>>(new Set())
interface MemberInfo {
  email: string
  image_url: string | null
}
const memberInfo = ref<Map<string, MemberInfo>>(new Map())
const showUnresolvedOnly = ref(true)

const acceptDialogId = 'compatibility-accept-event'
const acceptReason = ref('')
const acceptTargetIds = ref<number[]>([])

// One logical change can produce one event per platform (the channel may be the
// default for ios, android and electron at once). Group those rows so the table
// shows one entry per change, with the platforms as chips.
const groupedEvents = computed<CompatibilityEventGroup[]>(() => groupCompatibilityEvents(events.value))

const visibleGroups = computed<CompatibilityEventGroup[]>(() => {
  if (showUnresolvedOnly.value)
    return groupedEvents.value.filter(group => !group.resolved)
  return groupedEvents.value
})

async function loadAppInfo() {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', id.value)
      .single()
    app.value = dataApp || app.value
  }
  catch (error) {
    console.error(error)
  }
}

async function loadEvents() {
  try {
    const { data, error } = await supabase
      .from('compatibility_events')
      .select('*')
      .eq('app_id', id.value)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Compatibility] Error loading events:', error)
      events.value = []
      return
    }

    events.value = (data ?? []) as CompatibilityEventRow[]
  }
  catch (error) {
    console.error('[Compatibility] Error loading events:', error)
    events.value = []
  }
}

// Channel names are snapshots that outlive deleted channels; only link the
// ones that still exist.
async function loadExistingChannels() {
  const channelIds = [...new Set(events.value
    .map(event => event.channel_id)
    .filter((channelId): channelId is number => channelId !== null))]
  if (channelIds.length === 0) {
    existingChannelIds.value = new Set()
    return
  }
  const { data, error } = await supabase
    .from('channels')
    .select('id')
    .eq('app_id', id.value)
    .in('id', channelIds)
  if (error) {
    console.error('[Compatibility] Error checking channels:', error)
    existingChannelIds.value = new Set()
    return
  }
  existingChannelIds.value = new Set((data ?? []).map(channel => channel.id))
}

function openChannel(event: CompatibilityEventRow) {
  if (event.channel_id === null)
    return
  router.push(`/app/${encodeURIComponent(id.value)}/channel/${event.channel_id}`)
}

// Bundle names are snapshots that outlive purged bundles; only link the ones
// that still exist (not soft-deleted, matching the bundle pages).
async function loadExistingVersions() {
  const versionIds = [...new Set(events.value
    .flatMap(event => [event.current_version_id, event.previous_version_id])
    .filter((versionId): versionId is number => versionId !== null))]
  if (versionIds.length === 0) {
    existingVersionIds.value = new Set()
    return
  }
  const { data, error } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', id.value)
    .eq('deleted', false)
    .in('id', versionIds)
  if (error) {
    console.error('[Compatibility] Error checking bundles:', error)
    existingVersionIds.value = new Set()
    return
  }
  existingVersionIds.value = new Set((data ?? []).map(version => version.id))
}

function openBundle(versionId: number) {
  router.push(`/app/${encodeURIComponent(id.value)}/bundle/${versionId}`)
}

// Resolve accepting users' ids to emails via the org-members RPC (the users
// table is self-read-only under RLS).
async function loadMemberEmails() {
  const orgId = app.value?.owner_org
  const needsEmails = events.value.some(event => event.resolution_kind === 'accepted' && event.resolved_by !== null)
  if (!orgId || !needsEmails)
    return
  const { data, error } = await supabase.rpc('get_org_members', { guild_id: orgId })
  if (error) {
    console.error('[Compatibility] Error loading org members:', error)
    return
  }
  // Member avatars can be private storage paths — sign them (cached) so the
  // <img> actually loads; ready-to-use URLs pass through unchanged.
  const entries = await Promise.all((data ?? []).map(async (member) => {
    let imageUrl: string | null = null
    try {
      imageUrl = (await createSignedImageUrl(member.image_url)) || null
    }
    catch (error) {
      console.warn('[Compatibility] Cannot sign member image', error)
    }
    return [member.uid, { email: member.email, image_url: imageUrl }] as const
  }))
  memberInfo.value = new Map(entries)
}

// The three lookups only need `events` (and `app` for the member emails), so
// they run in parallel after the events query.
async function loadLookups() {
  await Promise.all([loadExistingChannels(), loadExistingVersions(), loadMemberEmails()])
}

async function refreshData() {
  isLoading.value = true
  try {
    await Promise.all([loadAppInfo(), loadEvents()])
    await loadLookups()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

function bundleLabel(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : t('unknown')
}

function resolutionLabel(event: CompatibilityEventRow): string {
  const note = event.resolution_note?.trim() ?? ''

  if (event.resolution_kind === 'auto_compatible')
    return note.length > 0 ? note : t('compatibility-resolution-auto')

  if (event.resolution_kind === 'accepted') {
    const who = (event.resolved_by ? memberInfo.value.get(event.resolved_by)?.email : undefined)
      ?? event.resolved_by
      ?? t('unknown')
    const acceptedBy = t('compatibility-accepted-by', { user: who })
    return note.length > 0 ? `${acceptedBy} — ${note}` : acceptedBy
  }

  return note.length > 0 ? note : t('compatibility-status-resolved')
}

function openDependencyDiff(event: CompatibilityEventRow) {
  const path = dependencyDiffPath(id.value, event)
  if (!path)
    return
  router.push(path)
}

async function acknowledgeEvents(eventIds: number[], note: string) {
  try {
    for (const eventId of eventIds) {
      const { error } = await supabase.rpc('acknowledge_compatibility_event', {
        event_id: eventId,
        note,
      })

      if (error) {
        console.error('[Compatibility] Error accepting event:', error)
        toast.error(t('compatibility-reason-required'))
        return
      }
    }

    toast.success(t('compatibility-status-resolved'))
    await loadEvents()
    await loadLookups()
  }
  catch (error) {
    console.error('[Compatibility] Error accepting events:', error)
    toast.error(t('compatibility-reason-required'))
  }
}

function openAcceptDialog(group: CompatibilityEventGroup) {
  acceptTargetIds.value = group.unresolvedEvents.map(event => event.id)
  acceptReason.value = ''

  dialogStore.openDialog({
    id: acceptDialogId,
    title: t('compatibility-accept-title'),
    description: t('compatibility-accept-message'),
    size: 'lg',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('compatibility-accept'),
        role: 'primary',
        preventClose: true,
        handler: async () => {
          const note = acceptReason.value.trim()
          if (note.length === 0) {
            toast.error(t('compatibility-reason-required'))
            return false
          }
          const targetIds = acceptTargetIds.value
          if (targetIds.length === 0)
            return
          dialogStore.closeDialog({ text: t('compatibility-accept'), role: 'primary' })
          await acknowledgeEvents(targetIds, note)
        },
      },
    ],
  })
}

const resolutionDialogId = 'compatibility-resolution-detail'
const resolutionDetail = ref<CompatibilityEventRow | null>(null)
const resolutionDetailImageFailed = ref(false)
const resolutionDetailMember = computed<MemberInfo | null>(() => {
  const resolvedBy = resolutionDetail.value?.resolved_by
  return resolvedBy ? memberInfo.value.get(resolvedBy) ?? null : null
})

function openResolutionDialog(group: CompatibilityEventGroup) {
  resolutionDetail.value = group.representative
  resolutionDetailImageFailed.value = false
  dialogStore.openDialog({
    id: resolutionDialogId,
    title: t('compatibility-resolution-title'),
    size: 'lg',
    buttons: [
      {
        text: t('close'),
        role: 'cancel',
      },
    ],
  })
}

watchEffect(async () => {
  const params = route.params as { app?: string }
  if (params.app && lastPath.value !== route.path) {
    lastPath.value = route.path
    id.value = params.app
    await refreshData()
    displayStore.NavTitle = ''
    displayStore.defaultBack = '/apps'
  }
})
</script>

<template>
  <div>
    <div v-if="app || isLoading">
      <div class="mt-0 md:mt-8">
        <div class="w-full h-full px-0 pt-0 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h1 class="text-xl font-semibold text-slate-900 dark:text-white">
                {{ t('compatibility-events') }}
              </h1>
              <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  v-model="showUnresolvedOnly"
                  data-test="compatibility-filter-unresolved"
                  type="checkbox"
                  class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
                >
                {{ t('compatibility-filter-unresolved') }}
              </label>
            </div>

            <!-- Empty state -->
            <div
              v-if="!isLoading && visibleGroups.length === 0"
              class="flex flex-col items-center justify-center py-16 text-center border rounded-lg border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
            >
              <IconCheckCircle class="w-12 h-12 mb-4 text-emerald-500" />
              <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
                {{ t('compatibility-empty') }}
              </h2>
              <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {{ t('compatibility-empty-description') }}
              </p>
            </div>

            <!-- Events table -->
            <div
              v-else
              class="overflow-x-auto border rounded-lg border-slate-200 dark:border-slate-700"
            >
              <table class="w-full text-sm text-left">
                <thead class="text-xs uppercase text-slate-500 bg-slate-50 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th scope="col" class="px-4 py-3">
                      {{ t('platform') }}
                    </th>
                    <th scope="col" class="px-4 py-3">
                      {{ t('channel') }}
                    </th>
                    <th scope="col" class="px-4 py-3">
                      {{ t('compatibility-change') }}
                    </th>
                    <th scope="col" class="px-4 py-3">
                      {{ t('compatibility-offenders') }}
                    </th>
                    <th scope="col" class="px-4 py-3">
                      {{ t('date') }}
                    </th>
                    <th scope="col" class="px-4 py-3">
                      {{ t('status') }}
                    </th>
                    <th scope="col" class="px-4 py-3 text-right">
                      <span class="sr-only">{{ t('compatibility-view-details') }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="group in visibleGroups"
                    :key="group.key"
                    data-test="compatibility-row"
                    :data-event-id="group.representative.id"
                    :data-event-ids="group.events.map(event => event.id).join(',')"
                    class="border-t border-slate-200 dark:border-slate-700"
                  >
                    <td class="px-4 py-3 text-slate-700 dark:text-slate-200">
                      <div class="flex flex-wrap gap-1">
                        <span
                          v-for="platform in group.platforms"
                          :key="platform"
                          class="px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {{ platformLabel(platform) }}
                        </span>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-slate-700 dark:text-slate-200">
                      <button
                        v-if="group.representative.channel_id !== null && existingChannelIds.has(group.representative.channel_id)"
                        type="button"
                        class="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                        data-test="compatibility-channel-link"
                        @click="openChannel(group.representative)"
                      >
                        {{ group.representative.channel_name }}
                      </button>
                      <span v-else>{{ group.representative.channel_name }}</span>
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">
                      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 whitespace-nowrap">
                        <button
                          v-if="group.representative.previous_version_id !== null && existingVersionIds.has(group.representative.previous_version_id)"
                          type="button"
                          class="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                          data-test="compatibility-previous-bundle-link"
                          @click="openBundle(group.representative.previous_version_id)"
                        >
                          {{ bundleLabel(group.representative.previous_version_name) }}
                        </button>
                        <span v-else>{{ bundleLabel(group.representative.previous_version_name) }}</span>
                        <IconArrowRight aria-hidden="true" class="w-3.5 h-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                        <button
                          v-if="group.representative.current_version_id !== null && existingVersionIds.has(group.representative.current_version_id)"
                          type="button"
                          class="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                          data-test="compatibility-current-bundle-link"
                          @click="openBundle(group.representative.current_version_id)"
                        >
                          {{ bundleLabel(group.representative.current_version_name) }}
                        </button>
                        <span v-else>{{ bundleLabel(group.representative.current_version_name) }}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <div v-if="group.representative.offenders && group.representative.offenders.length > 0" class="flex flex-wrap gap-1" :title="group.representative.offenders.join(', ')">
                        <span
                          v-for="offender in group.representative.offenders.slice(0, 3)"
                          :key="offender"
                          class="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                        >
                          {{ offender }}
                        </span>
                        <span
                          v-if="group.representative.offenders.length > 3"
                          class="px-2 py-0.5 text-xs rounded bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                        >
                          {{ t('compatibility-offenders-more', { count: group.representative.offenders.length - 3 }) }}
                        </span>
                      </div>
                      <span v-else class="text-slate-400">—</span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {{ formatLocalDateTime(group.representative.created_at) }}
                    </td>
                    <td class="px-4 py-3">
                      <span
                        v-if="!group.resolved"
                        class="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      >
                        {{ t('compatibility-status-unresolved') }}
                      </span>
                      <div v-else class="flex flex-col gap-0.5">
                        <span class="px-2 py-0.5 w-fit text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                          {{ t('compatibility-status-resolved') }}
                        </span>
                        <button
                          type="button"
                          class="text-xs text-left text-slate-500 dark:text-slate-400 line-clamp-2 max-w-xs cursor-pointer hover:underline underline-offset-2"
                          :title="resolutionLabel(group.representative)"
                          data-test="compatibility-resolution-detail"
                          @click="openResolutionDialog(group)"
                        >
                          {{ resolutionLabel(group.representative) }}
                        </button>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <div class="flex items-center justify-end gap-2">
                        <button
                          v-if="dependencyDiffPath(id, group.representative)"
                          data-test="compatibility-diff-link"
                          class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30"
                          @click="openDependencyDiff(group.representative)"
                        >
                          <IconExternalLink class="w-3.5 h-3.5" />
                          {{ t('compatibility-view-dependency-diff') }}
                        </button>
                        <button
                          v-if="!group.resolved"
                          data-test="compatibility-accept"
                          class="inline-flex items-center px-3 py-1 text-xs font-medium text-white rounded-md bg-amber-600 hover:bg-amber-700"
                          @click="openAcceptDialog(group)"
                        >
                          {{ t('compatibility-accept') }}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('app-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('app-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="$router.push(`/apps`)">
        {{ t('back-to-apps') }}
      </button>
    </div>

    <!-- Accept dialog content (reason input) -->
    <Teleport
      v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === acceptDialogId"
      defer
      to="#dialog-v2-content"
    >
      <div class="space-y-2">
        <label class="block text-sm font-medium text-slate-800 dark:text-slate-100" for="compatibility-accept-reason">
          {{ t('compatibility-reason') }}
        </label>
        <textarea
          id="compatibility-accept-reason"
          v-model="acceptReason"
          data-test="compatibility-accept-reason"
          rows="3"
          class="w-full px-3 py-2 text-sm border rounded-md border-slate-300 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          :placeholder="t('compatibility-reason-placeholder')"
        />
      </div>
    </Teleport>

    <!-- Resolution detail dialog (full reason + resolver) -->
    <Teleport
      v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === resolutionDialogId && resolutionDetail"
      defer
      to="#dialog-v2-content"
    >
      <div class="space-y-4">
        <div v-if="resolutionDetail.resolution_kind === 'accepted'" class="flex items-center gap-3">
          <img
            v-if="resolutionDetailMember?.image_url && !resolutionDetailImageFailed"
            :src="resolutionDetailMember.image_url"
            alt=""
            class="object-cover w-10 h-10 rounded-full"
            @error="resolutionDetailImageFailed = true"
          >
          <div
            v-else
            class="flex items-center justify-center w-10 h-10 text-sm font-semibold rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
          >
            {{ (resolutionDetailMember?.email ?? resolutionDetail.resolved_by ?? '?').charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0">
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ t('compatibility-resolved-by') }}
            </p>
            <p class="text-sm font-medium truncate text-slate-800 dark:text-slate-100">
              {{ resolutionDetailMember?.email ?? resolutionDetail.resolved_by }}
            </p>
          </div>
          <a
            v-if="resolutionDetailMember?.email"
            :href="`mailto:${resolutionDetailMember.email}`"
            class="inline-flex items-center px-3 py-1.5 ml-auto text-xs font-medium text-white rounded-md shrink-0 bg-blue-600 hover:bg-blue-700"
            data-test="compatibility-email-user"
          >
            {{ t('compatibility-email-user') }}
          </a>
        </div>
        <p v-else class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('compatibility-resolution-auto') }}
        </p>
        <p class="text-sm whitespace-pre-wrap break-words text-slate-800 dark:text-slate-100">
          {{ resolutionDetail.resolution_note?.trim() || resolutionLabel(resolutionDetail) }}
        </p>
      </div>
    </Teleport>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
