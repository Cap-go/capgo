<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AuditLogTable from '~/components/tables/AuditLogTable.vue'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const isLoading = ref(true)

displayStore.NavTitle = t('audit-logs')

onMounted(async () => {
  await organizationStore.dedupFetchOrganizations()
  isLoading.value = false
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div v-if="isLoading" class="flex items-center justify-center h-64">
      <span class="loading loading-spinner loading-lg" />
    </div>

    <div v-else-if="currentOrganization" class="flex-1">
      <div class="mb-4">
        <p class="text-sm text-base-content/70">
          {{ t('audit-logs-description') }}
        </p>
      </div>

      <AuditLogTable :org-id="currentOrganization.gid" />
    </div>

    <div v-else class="flex items-center justify-center h-64">
      <p class="text-base-content/70">
        {{ t('no-organization-selected') }}
      </p>
    </div>
  </div>
</template>
