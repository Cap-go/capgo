<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useOrganizationStore } from '~/stores/organization'
import { useDisplayStore } from '~/stores/display'
import Plus from '~icons/heroicons/plus'

const { t } = useI18n()

const organizationStore = useOrganizationStore()
const displayStore = useDisplayStore()

const { currentOrganization } = storeToRefs(organizationStore)

const members = ref([])

onMounted(async () => {
  members.value = organizationStore.getMembers(currentOrganization.id)
})
</script>

<template>
  <div class="h-full p-8 max-h-fit grow md:pb-0 overflow-hidden">
    <div class="flex justify-between w-full">
      <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
        {{ t('members') }}
      </h2>
      <button type="button" class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium text-sm px-5 py-2.5 text-center inline-flex items-center mr-2 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">
        <Plus />
        {{ t('add-member') }}
      </button>
    </div>
    <div v-for="member in members" :key="member.id">
      <div class="flex justify-between">
        <div class="flex">
          <img
            v-if="member?.profilePhoto" class="object-cover w-20 h-20 mask mask-squircle" :src="member.profilePhoto"
            width="80" height="80" alt="profile_photo"
          >
          <div v-else class="flex items-center justify-center w-20 h-20 text-4xl border border-black rounded-full dark:border-white">
            <p>{{ 'N/A' }}</p>
          </div>
          {{ member.name }}
        </div>
        <div>
          <p class="text-lg font-medium text-gray-900 dark:text-white">
            ...
          </p>
        </div>
      </div>
      <div>{{ member.position }}</div>
      <div>{{ member.role }}</div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
