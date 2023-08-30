<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import Trash from '~icons/heroicons/trash'
import Wrench from '~icons/heroicons/Wrench'

import { useOrganizationStore } from '~/stores/organization'
import Plus from '~icons/heroicons/plus'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const displayStore = useDisplayStore()

const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)

const members = ref([] as Database['public']['Functions']['get_org_members']['Returns'])

watch(currentOrganization, async () => {
  members.value = await organizationStore.getMembers()
})

onMounted(async () => {
  members.value = await organizationStore.getMembers()
})

function showInviteModal() {
  displayStore.dialogOption = {
    header: t('insert-invite-email'),
    message: 'Email',
    input: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-invite'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
}
</script>

<template>
  <div class="h-full p-8 max-h-fit grow md:pb-0 overflow-hidden">
    <div class="flex justify-between w-full">
      <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
        {{ t('members') }}
      </h2>
      <button type="button" class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium text-sm px-5 py-2.5 text-center inline-flex items-center mr-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800" @click="showInviteModal">
        <Plus />
        {{ t('add-member') }}
      </button>
    </div>
    <div class="flex flex-col overflow-y-scroll bg-white shadow-lg border-slate-200 md:mx-auto md:mt-5 md:w-full md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800">
      <dl class="divide-y divide-gray-500">
        <div v-for="member in members" :key="member.id">
          <div class="flex justify-between mt-2 mb-2 ml-2">
            <div class="flex w-1/2">
              <img
                v-if="member?.image_url" class="object-cover w-20 h-20 mask mask-squircle" :src="member.image_url"
                width="80" height="80" alt="profile_photo"
              >
              <div v-else class="flex items-center justify-center w-20 h-20 text-4xl border border-black rounded-full dark:border-white">
                <p>{{ 'N/A' }}</p>
              </div>
              <div class="mt-auto mb-auto ml-auto">
                {{ member.email }}
              </div>
            </div>
            <div class="mt-auto mb-auto mr-4">
              <button class="w-7 h-7 bg-transparent ml-4">
                <Wrench class="mr-4 text-lg text-[#397cea]" />
              </button>
              <button class="w-7 h-7 bg-transparent ml-4">
                <Trash class="mr-4 text-lg text-red-600" />
              </button>
            </div>
          </div>
        </div>
      </dl>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
