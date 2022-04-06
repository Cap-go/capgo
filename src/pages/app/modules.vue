<script setup lang="ts">
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonItemDivider,
  IonLabel,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const dependencies = JSON.parse((import.meta.env.package_dependencies as string) || '{}')
interface Module {
  name: string
  version: string
  url: string
}
const modules = ref([] as Module[])
Object.keys(dependencies).forEach((dep) => {
  console.log('dep', dep)
  if (dep.includes('capacitor')) {
    modules.value.push({
      name: dep,
      version: dependencies[dep],
      url: `https://www.npmjs.com/package/${dep}`,
    })
  }
})
console.log('modules', modules.value)

</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle color="warning">
          {{ t("account.heading") }}
        </IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent :fullscreen="true">
      <IonHeader collapse="condense">
        <IonToolbar>
          <IonTitle color="warning" size="large">
            {{ t("module.heading") }}
          </IonTitle>
        </IonToolbar>
      </IonHeader>
      <div class="p-6">
        <ul class="grid grid-rows-4 gap-y-5 mb-6">
          <li>
            <a
              class="flex justify-between items-center"
              href="https://github.com/riderx/awesome-capacitor"
              target="_blank"
            >
              <span class="font-bold">Discover module in Awesome capacitor</span>
              <IonIcon :icon="chevronForwardOutline" class="text-azure-500" />
            </a>
          </li>
          <ion-item-divider>
            <ion-label>
              available in the sandbox
            </ion-label>
          </ion-item-divider>
          <li v-for="(module, index) in modules" :key="index">
            <a
              class="flex justify-between items-center"
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

<route lang="yaml">
meta:
  option: tabs
</route>
