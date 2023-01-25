<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsSidebar from '../../../components/settings/SettingsSidebar.vue'
import AccountPanel from '../../../components/settings/AccountPanel.vue'

const { t } = useI18n()
</script>

<template>
  <div class="w-full px-4 py-8 mx-auto sm:px-6 lg:px-8 max-w-9xl">
    <!-- Page header -->
    <div class="mb-8">
      <!-- Title -->
      <h1 class="text-2xl font-bold md:text-3xl text-slate-800 dark:text-white">
        {{ t('settings') }} ⚙️
      </h1>
    </div>

    <!-- Content -->
    <div class="mb-8 bg-white rounded-sm shadow-lg dark:bg-gray-800">
      <div class="flex flex-col md:flex-row md:-mr-px">
        <SettingsSidebar />
        <AccountPanel />
      </div>
    </div>
  </div>
</template>
