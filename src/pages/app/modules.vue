<script setup lang="ts">
import {
  IonContent,
  IonIcon,
  IonItemDivider,
  IonLabel,
  IonPage,
} from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'
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
  <IonPage>
    <TitleHead :title="t('module.heading')" default-back="/app/home" color="warning" />
    <IonContent :fullscreen="true">
      <div class="p-6">
        <ul class="grid grid-rows-4 mb-6 gap-y-5">
          <li>
            <a
              class="flex items-center justify-between"
              href="https://github.com/riderx/awesome-capacitor"
              rel="noopener"
              target="_blank"
            >
              <span class="font-bold">{{ t('discover-module-in-a') }}</span>
              <IonIcon :icon="chevronForwardOutline" class="text-azure-500" />
            </a>
          </li>
          <IonItemDivider>
            <IonLabel>
              {{ t('available-in-the-san') }}
            </IonLabel>
          </IonItemDivider>
          <li v-for="(module, index) in modules" :key="index">
            <a
              class="flex items-center justify-between"
              :href="module.url"
              target="_blank"
            >
              <span class="font-bold">{{ module.name }}@{{ module.version }}</span>
              <IonIcon :icon="chevronForwardOutline" class="text-azure-500" />
            </a>
          </li>
        </ul>
      </div>
    </IonContent>
  </IonPage>
</template>
