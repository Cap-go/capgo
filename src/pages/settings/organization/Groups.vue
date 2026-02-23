<script setup lang="ts">
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GroupsRbacManager from '~/components/organization/GroupsRbacManager.vue'
import { checkPermissions } from '~/services/permissions'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const displayStore = useDisplayStore()
displayStore.NavTitle = t('groups')

const canManage = computedAsync(async () => {
  if (!currentOrganization.value?.gid)
    return false
  return await checkPermissions('org.update_user_roles', { orgId: currentOrganization.value.gid })
}, false)

const canShow = computed(() =>
  !!currentOrganization.value?.use_new_rbac && !!currentOrganization.value?.gid,
)
</script>

<template>
  <div>
    <GroupsRbacManager
      v-if="canShow && canManage"
      :org-id="currentOrganization!.gid"
      :can-manage="canManage"
    />

    <div
      v-else
      class="flex flex-col bg-white border shadow-lg md:p-6 md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900"
    >
      <h2 class="text-2xl font-bold dark:text-white text-slate-800">
        {{ t('groups') }}
      </h2>
      <p class="mt-2 text-sm text-slate-500">
        {{ t('groups-unavailable') }}
      </p>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
