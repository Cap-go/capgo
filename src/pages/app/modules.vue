<script setup lang="ts">
import IconNext from '~icons/ic/round-keyboard-arrow-right'
import { useI18n } from 'petite-vue-i18n'
import { ref } from 'vue'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const displayStore = useDisplayStore()

const dependencies = JSON.parse((import.meta.env.package_dependencies as string) || '{}')
interface Module {
  name: string
  version: string
  url: string
}
const modules = ref([] as Module[])
Object.keys(dependencies).forEach((dep) => {
  // console.log('dep', dep)
  if (dep.includes('capacitor')) {
    modules.value.push({
      name: dep,
      version: dependencies[dep],
      url: `https://www.npmjs.com/package/${dep}`,
    })
  }
})
function openLink(url?: string) {
  if (url)
    window.open(url, '_blank')
}
// console.log('modules', modules.value)
displayStore.NavTitle = t('module-heading')
displayStore.defaultBack = '/app/home'
</script>

<template>
  <div>
    <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-300 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800">
      <dl class="divide-y dark:divide-slate-200 dark:divide-slate-500">
        <InfoRow :label="t('discover-module-in-a')" :is-link="true" @click="openLink('https://github.com/riderx/awesome-capacitor')">
          <button class="ml-auto bg-transparent w-7 h-7">
            <IconNext />
          </button>
        </InfoRow>
        <InfoRow :label="t('available-in-the-san')" />
        <InfoRow v-for="(module, index) in modules" :key="index" :label="`${module.name}@${module.version}`" :is-link="true" @click="openLink(module.url)">
          <button class="ml-auto bg-transparent w-7 h-7">
            <IconNext />
          </button>
        </InfoRow>
      </dl>
    </div>
  </div>
</template>
