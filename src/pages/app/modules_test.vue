<script setup lang="ts">
import {
  IonContent,
  IonIcon,
  IonItemDivider,
  IonLabel,
  IonPage,
  toastController,
} from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NativeMarket } from '@capgo/native-market'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import TitleHead from '~/components/TitleHead.vue'

const { t } = useI18n()

interface Module {
  name: string
  method: string
  option: any
}
const modules = ref([] as Module[])

const mods = {
  NativeMarket,
  CapacitorUpdater,
}
modules.value.push(...[
  // {
  //   name: '',
  //   method: '',
  //   option: {},
  // },
  {
    name: 'NativeMarket',
    method: 'openStoreListing',
    option: { appId: 'ee.forgr.captain-time' },
  },
  {
    name: 'NativeMarket',
    method: 'openDevPage',
    option: { devId: '5700313618786177705' },
  },
  {
    name: 'NativeMarket',
    method: 'openCollection',
    option: { name: 'featured' },
  },
  {
    name: 'NativeMarket',
    method: 'openEditorChoicePage',
    option: { editorChoice: 'editorial_fitness_apps_us' },
  },
  {
    name: 'NativeMarket',
    method: 'search',
    option: { terms: 'capacitor' },
  },
  {
    name: 'CapacitorUpdater',
    method: 'getDeviceId',
    option: {},
  },
  {
    name: 'CapacitorUpdater',
    method: 'current',
    option: {},
  },
  {
    name: 'CapacitorUpdater',
    method: 'getLatest',
    option: {},
  },
  {
    name: 'CapacitorUpdater',
    method: 'getPluginVersion',
    option: {},
  },
  {
    name: 'CapacitorUpdater',
    method: 'getLatest',
    option: {},
  },
])
// CapacitorUpdater.
const runMethod = async (m: Module) => {
  console.log('runMethod', m);
  (await toastController
    .create({
      message: `runMethod: ${JSON.stringify(m)}`,
      duration: 2000,
    })).present();
  (mods as any)[m.name][m.method]({ ...m.option }).then((res: any) => {
    console.log('resMethod', m, res)
    setTimeout(async () => {
      (await toastController
        .create({
          message: `resMethod: ${JSON.stringify(res)}`,
          duration: 2000,
        })).present()
    }, 2000)
  }).catch((err: any) => {
    console.log('errMethod', m, err)
    setTimeout(async () => {
      (await toastController
        .create({
          message: `errMethod: ${err}`,
          duration: 2000,
        })).present()
    }, 2000)
  })
}
// console.log('modules', modules.value)
</script>

<template>
  <IonPage>
    <TitleHead :title="`${t('module.heading')} ${t('tests')}`" default-back="/app/home" color="warning" />
    <IonContent :fullscreen="true">
      <div class="p-6">
        <ul class="grid grid-rows-4 mb-6 gap-y-5">
          <IonItemDivider>
            <IonLabel>
              {{ t('available-in-the-san') }}
            </IonLabel>
          </IonItemDivider>
          <li v-for="(module, index) in modules" :key="index" class="cursor-pointer" @click="runMethod(module)">
            <div
              class="flex items-center justify-between"
            >
              <span class="font-bold">{{ module.name }}@{{ module.method }} with {{ module.option }}</span>
              <IonIcon :icon="chevronForwardOutline" class="text-azure-500" />
            </div>
          </li>
        </ul>
      </div>
    </IonContent>
  </IonPage>
</template>
