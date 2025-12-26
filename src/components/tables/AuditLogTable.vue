<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'

import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconX from '~icons/heroicons/x-mark'
import Table from '~/components/Table.vue'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'

type AuditLog = Database['public']['Tables']['audit_logs']['Row']

interface ExtendedAuditLog extends AuditLog {
  user?: {
    uid: string
    email: string
  } | null
}

const props = defineProps<{
  orgId: string
}>()

const { t } = useI18n()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()

const auditLogs = ref<ExtendedAuditLog[]>([])
const members = ref<{ uid: string, email: string }[]>([])
const loading = ref(true)
const search = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const selectedTableFilter = ref<string>('')
const selectedOperationFilter = ref<string>('')

// Modal state
const selectedLog = ref<ExtendedAuditLog | null>(null)
const isModalOpen = ref(false)

const tableOptions = [
  { value: '', label: t('all-tables') },
  { value: 'orgs', label: t('organizations') },
  { value: 'channels', label: t('channels') },
  { value: 'app_versions', label: t('bundles') },
  { value: 'org_users', label: t('members') },
]

const operationOptions = [
  { value: '', label: t('all-operations') },
  { value: 'INSERT', label: t('created') },
  { value: 'UPDATE', label: t('updated') },
  { value: 'DELETE', label: t('deleted') },
]

function getOperationLabel(operation: string): string {
  switch (operation) {
    case 'INSERT':
      return t('created')
    case 'UPDATE':
      return t('updated')
    case 'DELETE':
      return t('deleted')
    default:
      return operation
  }
}

function getTableLabel(tableName: string): string {
  switch (tableName) {
    case 'orgs':
      return t('organization')
    case 'channels':
      return t('channel')
    case 'app_versions':
      return t('bundle')
    case 'org_users':
      return t('member')
    default:
      return tableName
  }
}

function getOperationClass(operation: string): string {
  switch (operation) {
    case 'INSERT':
      return 'badge-success'
    case 'UPDATE':
      return 'badge-warning'
    case 'DELETE':
      return 'badge-error'
    default:
      return 'badge-neutral'
  }
}

function openDetails(item: ExtendedAuditLog) {
  selectedLog.value = item
  isModalOpen.value = true
}

function closeModal() {
  isModalOpen.value = false
  selectedLog.value = null
}

function getChangedFieldsDisplay(item: ExtendedAuditLog): string {
  if (!item.changed_fields || item.changed_fields.length === 0) {
    return '-'
  }
  return item.changed_fields.slice(0, 3).join(', ') + (item.changed_fields.length > 3 ? '...' : '')
}

const columns = computed<TableColumn[]>(() => [
  {
    label: t('date'),
    key: 'created_at',
    mobile: true,
    sortable: true,
    displayFunction: item => formatDate(item.created_at),
  },
  {
    label: t('table'),
    key: 'table_name',
    mobile: true,
    sortable: false,
    displayFunction: item => getTableLabel(item.table_name),
  },
  {
    label: t('operation'),
    key: 'operation',
    mobile: true,
    sortable: false,
    class: 'text-center',
    displayFunction: item => getOperationLabel(item.operation),
  },
  {
    label: t('user'),
    key: 'user_id',
    mobile: false,
    displayFunction: item => item.user?.email || '-',
  },
  {
    label: t('changed-fields'),
    key: 'changed_fields',
    mobile: false,
    displayFunction: item => getChangedFieldsDisplay(item),
  },
  {
    label: t('details'),
    key: 'details',
    mobile: true,
    class: 'text-center cursor-pointer hover:underline',
    displayFunction: () => t('view'),
    onClick: (item: ExtendedAuditLog) => openDetails(item),
  },
])

async function fetchAuditLogs() {
  loading.value = true
  try {
    auditLogs.value.length = 0
    members.value = await organizationStore.getMembers()

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('org_id', props.orgId)
      .order('created_at', { ascending: false })

    // Apply table filter
    if (selectedTableFilter.value) {
      query = query.eq('table_name', selectedTableFilter.value)
    }

    // Apply operation filter
    if (selectedOperationFilter.value) {
      query = query.eq('operation', selectedOperationFilter.value)
    }

    // Apply search filter (search in record_id)
    if (search.value) {
      query = query.ilike('record_id', `%${search.value}%`)
    }

    const { data, error, count } = await query
      .range((page.value - 1) * pageSize.value, page.value * pageSize.value - 1)

    if (error) {
      console.error('Error fetching audit logs:', error)
      toast.error(t('error-fetching-audit-logs'))
      return
    }

    const rows = (data ?? []) as ExtendedAuditLog[]

    // Add user email to each row
    for (const item of rows) {
      const member = members.value.find(m => m.uid === item.user_id)
      if (member) {
        item.user = member
      }
    }

    auditLogs.value = rows
    total.value = count ?? 0
  }
  catch (error) {
    console.error('Error fetching audit logs:', error)
    toast.error(t('error-fetching-audit-logs'))
  }
  finally {
    loading.value = false
  }
}

function formatJson(data: unknown): string {
  if (!data)
    return '-'
  try {
    return JSON.stringify(data, null, 2)
  }
  catch {
    return String(data)
  }
}

function getChangeDiff(oldRecord: unknown, newRecord: unknown, changedFields: string[] | null): { field: string, oldValue: string, newValue: string }[] {
  if (!changedFields || changedFields.length === 0) {
    return []
  }

  const oldObj = (oldRecord || {}) as Record<string, unknown>
  const newObj = (newRecord || {}) as Record<string, unknown>

  return changedFields.map((field) => {
    const oldVal = JSON.stringify(oldObj[field], null, 2) ?? 'null'
    const newVal = JSON.stringify(newObj[field], null, 2) ?? 'null'
    return { field, oldValue: oldVal, newValue: newVal }
  })
}

watch([() => props.orgId, selectedTableFilter, selectedOperationFilter], () => {
  page.value = 1
  fetchAuditLogs()
})

watch([page, search], () => {
  fetchAuditLogs()
})

onMounted(() => {
  fetchAuditLogs()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Filters -->
    <div class="flex flex-wrap gap-4 items-center">
      <select
        v-model="selectedTableFilter"
        class="select select-bordered select-sm"
      >
        <option v-for="option in tableOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <select
        v-model="selectedOperationFilter"
        class="select select-bordered select-sm"
      >
        <option v-for="option in operationOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <!-- Table -->
    <Table
      :is-loading="loading"
      :search="search"
      :search-placeholder="t('search-by-record-id')"
      :total="total"
      :current-page="page"
      :columns="columns"
      :element-list="auditLogs"
      @update:search="search = $event"
      @update:current-page="page = $event"
      @reload="fetchAuditLogs"
    />

    <!-- Details Modal -->
    <dialog :open="isModalOpen" class="modal modal-bottom sm:modal-middle">
      <div class="modal-box max-w-3xl">
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-bold text-lg">
            {{ t('audit-log-details') }}
          </h3>
          <button class="btn btn-sm btn-circle btn-ghost" @click="closeModal">
            <IconX class="w-5 h-5" />
          </button>
        </div>

        <div v-if="selectedLog" class="space-y-4">
          <!-- Header info -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="badge" :class="getOperationClass(selectedLog.operation)">
              {{ getOperationLabel(selectedLog.operation) }}
            </span>
            <span class="text-sm text-base-content/70">
              {{ getTableLabel(selectedLog.table_name) }} #{{ selectedLog.record_id }}
            </span>
            <span class="text-sm text-base-content/50">
              {{ formatDate(selectedLog.created_at) }}
            </span>
          </div>

          <!-- User info -->
          <div v-if="selectedLog.user" class="text-sm">
            <span class="font-medium">{{ t('user') }}:</span>
            {{ selectedLog.user.email }}
          </div>

          <!-- Diff view for UPDATE operations -->
          <div v-if="selectedLog.operation === 'UPDATE' && selectedLog.changed_fields?.length">
            <h4 class="font-semibold mb-2">
              {{ t('changes') }}
            </h4>
            <div class="space-y-3">
              <div
                v-for="change in getChangeDiff(selectedLog.old_record, selectedLog.new_record, selectedLog.changed_fields)"
                :key="change.field"
                class="border border-base-300 rounded-lg p-3"
              >
                <div class="font-medium text-sm mb-2">
                  {{ change.field }}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div class="bg-error/10 p-2 rounded text-xs overflow-x-auto">
                    <div class="text-error/70 text-xs mb-1">
                      {{ t('before') }}
                    </div>
                    <pre class="text-error font-mono whitespace-pre-wrap break-all">{{ change.oldValue }}</pre>
                  </div>
                  <div class="bg-success/10 p-2 rounded text-xs overflow-x-auto">
                    <div class="text-success/70 text-xs mb-1">
                      {{ t('after') }}
                    </div>
                    <pre class="text-success font-mono whitespace-pre-wrap break-all">{{ change.newValue }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Full record for INSERT -->
          <div v-else-if="selectedLog.operation === 'INSERT'">
            <h4 class="font-semibold mb-2">
              {{ t('new-record') }}
            </h4>
            <pre class="bg-base-200 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{{ formatJson(selectedLog.new_record) }}</pre>
          </div>

          <!-- Full record for DELETE -->
          <div v-else-if="selectedLog.operation === 'DELETE'">
            <h4 class="font-semibold mb-2">
              {{ t('deleted-record') }}
            </h4>
            <pre class="bg-base-200 p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">{{ formatJson(selectedLog.old_record) }}</pre>
          </div>
        </div>

        <div class="modal-action">
          <button class="btn" @click="closeModal">
            {{ t('close') }}
          </button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop" @click="closeModal">
        <button>close</button>
      </form>
    </dialog>
  </div>
</template>
