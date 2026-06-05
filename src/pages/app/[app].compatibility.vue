<script setup lang="ts">
import type { CompatibilityEventRow } from '~/services/compatibilityEvents'
import type { Database } from '~/types/supabase.types'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconAlertCircle from '~icons/lucide/alert-circle'
import IconCheckCircle from '~icons/lucide/check-circle'
import IconExternalLink from '~icons/lucide/external-link'
import { dependencyDiffPath, isResolved, platformLabel } from '~/services/compatibilityEvents'
import { formatLocalDateTime } from '~/services/date'
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
const showUnresolvedOnly = ref(false)

const acceptDialogId = 'compatibility-accept-event'
const acceptReason = ref('')
const acceptTargetId = ref<number | null>(null)

const visibleEvents = computed<CompatibilityEventRow[]>(() => {
  if (showUnresolvedOnly.value)
    return events.value.filter(event => !isResolved(event))
  return events.value
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

async function refreshData() {
  isLoading.value = true
  try {
    await Promise.all([loadAppInfo(), loadEvents()])
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
    const who = event.resolved_by ?? t('unknown')
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

async function acknowledgeEvent(eventId: number, note: string) {
  try {
    const { error } = await supabase.rpc('acknowledge_compatibility_event', {
      event_id: eventId,
      note,
    })

    if (error) {
      console.error('[Compatibility] Error accepting event:', error)
      toast.error(t('compatibility-reason-required'))
      return
    }

    toast.success(t('compatibility-status-resolved'))
    await loadEvents()
  }
  catch (error) {
    console.error('[Compatibility] Error accepting event:', error)
    toast.error(t('compatibility-reason-required'))
  }
}

function openAcceptDialog(event: CompatibilityEventRow) {
  acceptTargetId.value = event.id
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
          const targetId = acceptTargetId.value
          if (targetId == null)
            return
          dialogStore.closeDialog({ text: t('compatibility-accept'), role: 'primary' })
          await acknowledgeEvent(targetId, note)
        },
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
              v-if="!isLoading && visibleEvents.length === 0"
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
                      {{ t('compatibility-current-bundle') }}
                    </th>
                    <th scope="col" class="px-4 py-3">
                      {{ t('compatibility-previous-bundle') }}
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
                    v-for="event in visibleEvents"
                    :key="event.id"
                    data-test="compatibility-row"
                    :data-event-id="event.id"
                    class="border-t border-slate-200 dark:border-slate-700"
                  >
                    <td class="px-4 py-3 text-slate-700 dark:text-slate-200">
                      {{ platformLabel(event.platform) }}
                    </td>
                    <td class="px-4 py-3 text-slate-700 dark:text-slate-200">
                      {{ event.channel_name }}
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">
                      {{ bundleLabel(event.current_version_name) }}
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">
                      {{ bundleLabel(event.previous_version_name) }}
                    </td>
                    <td class="px-4 py-3">
                      <div v-if="event.offenders && event.offenders.length > 0" class="flex flex-wrap gap-1">
                        <span
                          v-for="offender in event.offenders"
                          :key="offender"
                          class="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                        >
                          {{ offender }}
                        </span>
                      </div>
                      <span v-else class="text-slate-400">—</span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {{ formatLocalDateTime(event.created_at) }}
                    </td>
                    <td class="px-4 py-3">
                      <span
                        v-if="!isResolved(event)"
                        class="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      >
                        {{ t('compatibility-status-unresolved') }}
                      </span>
                      <div v-else class="flex flex-col gap-0.5">
                        <span class="px-2 py-0.5 w-fit text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                          {{ t('compatibility-status-resolved') }}
                        </span>
                        <span class="text-xs text-slate-500 dark:text-slate-400">
                          {{ resolutionLabel(event) }}
                        </span>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <div class="flex items-center justify-end gap-2">
                        <button
                          v-if="dependencyDiffPath(id, event)"
                          data-test="compatibility-diff-link"
                          class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30"
                          @click="openDependencyDiff(event)"
                        >
                          <IconExternalLink class="w-3.5 h-3.5" />
                          {{ t('compatibility-view-dependency-diff') }}
                        </button>
                        <button
                          v-if="!isResolved(event)"
                          data-test="compatibility-accept"
                          class="inline-flex items-center px-3 py-1 text-xs font-medium text-white rounded-md bg-amber-600 hover:bg-amber-700"
                          @click="openAcceptDialog(event)"
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
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
