<script setup lang="ts">
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ApiKeyRbacManager from '~/components/organization/ApiKeyRbacManager.vue'
import { checkPermissions } from '~/services/permissions'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const displayStore = useDisplayStore()

displayStore.NavTitle = t('api-keys')

const isPermissionLoading = ref(false)
const canManage = computedAsync(async () => {
  if (!currentOrganization.value?.gid)
    return false
  return await checkPermissions('org.update_user_roles', { orgId: currentOrganization.value.gid })
}, false, { evaluating: isPermissionLoading })

const canShow = computed(() =>
  !!currentOrganization.value?.use_new_rbac && !!currentOrganization.value?.gid,
)
</script>

<template>
  <div>
    <ApiKeyRbacManager
      v-if="canShow"
      :org-id="currentOrganization!.gid"
      :org-name="currentOrganization!.name || currentOrganization!.gid"
      :can-manage="canManage"
    />

    <div
      v-else-if="!isPermissionLoading"
      class="flex flex-col bg-white border shadow-lg md:p-6 md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900"
    >
      <h2 class="text-2xl font-bold dark:text-white text-slate-800">
        {{ t('api-keys') }}
      </h2>
      <p class="mt-2 text-sm text-slate-500">
        {{ t('api-keys-unavailable') }}
      </p>
    </div>
  </div>
</template>

<route lang="yaml">
path: /settings/organization/api-keys
meta:
  layout: settings
</route>
