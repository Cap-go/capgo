<script setup lang="ts">
import { kBlockTitle, kList, kListItem } from 'konsta/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TitleHead from '~/components/TitleHead.vue'

const { t } = useI18n()

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
// console.log('modules', modules.value)
</script>

<template>
  <TitleHead :title="t('module.heading')" default-back="/app/home" />
  <k-list strong-ios outline-ios>
    <k-list-item
      link :title="t('discover-module-in-a')" href="https://github.com/riderx/awesome-capacitor" rel="noopener"
      target="_blank"
    />
  </k-list>
  <k-block-title>{{ t('available-in-the-san') }}</k-block-title>
  <k-list strong-ios outline-ios>
    <k-list-item
      v-for="(module, index) in modules" :key="index" link :title="`${module.name}@${module.version}`" :href="module.url"
      target="_blank"
    />
  </k-list>
</template>
