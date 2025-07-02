<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import { ref, defineProps, defineExpose } from 'vue'
import { toast } from 'vue-sonner'
import { useDialogV2Store } from '~/stores/dialogv2'
import { Organization, useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const router = useRouter()
const dialogStore = useDialogV2Store()
const deleteInput = ref('')

interface Props {
  org?: Organization
}

const props = defineProps<Props>()


async function open() {
  dialogStore.openDialog({
    title: t('delete-org'),
    description: `${t('please-confirm-org-del')}`.replace('%1', props.org?.name ?? ''),
    size: 'lg',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-confirm'),
        id: 'confirm-button',
        role: 'danger',
        preventClose: true,
        handler: async () => {
          if (props.org) {
            if (deleteInput.value !== (props.org.name ?? '')) {
              toast.error(t('wrong-name-org-del').replace('%1', props.org.name ?? ''))
            } else {
              const { error } = await organizationStore.deleteOrganization(props.org.gid)

              if (error) {
                toast.error(t('cannot-del-org'))
              }
              else {
                toast.success(t('org-deleted'))
                await organizationStore.fetchOrganizations()
                await organizationStore.setCurrentOrganizationToFirst()
                router.push('/app')
              }
            }
          }

        },
      },
    ],
  })
}

defineExpose({
  open
});

</script>

<template>
  <div>
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('delete-org')" to="#dialog-v2-content" defer>
      <div class="w-full">
        <input
          v-model="deleteInput"
          type="text"
          :placeholder="t('type-organization-name-to-confirm')"
          class="w-full p-3 border border-gray-300 rounded-lg dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          @keydown.enter="$event.preventDefault()"
        >
      </div>
    </Teleport>
  </div>
</template>
