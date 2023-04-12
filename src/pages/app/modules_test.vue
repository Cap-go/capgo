<script setup lang="ts">
import { kBlockTitle, kList, kListItem } from 'konsta/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NativeMarket } from '@capgo/native-market'
import { NativeAudio } from '@capgo/native-audio'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { Camera } from '@capacitor/camera'
import { Mute } from '@capgo/capacitor-mute'
import { toast } from 'vue-sonner'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const displayStore = useDisplayStore()

interface Module {
  name: string
  method: string
  option: any
}
const modules = ref([] as Module[])

const mods = {
  NativeMarket,
  CapacitorUpdater,
  Camera,
  Mute,
  NativeAudio,
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
    name: 'NativeAudio',
    method: 'preload',
    option: {
      assetId: 'example',
      assetPath: 'file_example.mp3',
      audioChannelNum: 1,
      isUrl: false,
    },
  },
  {
    name: 'NativeAudio',
    method: 'play',
    option: { assetId: 'example' },
  },
  {
    name: 'NativeAudio',
    method: 'stop',
    option: { assetId: 'example' },
  },
  {
    name: 'NativeAudio',
    method: 'pause',
    option: { assetId: 'example' },
  },
  {
    name: 'NativeAudio',
    method: 'resume',
    option: { assetId: 'example' },
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
    method: 'getChannel',
    option: {},
  },
  {
    name: 'Mute',
    method: 'isMuted',
    option: {},
  },
  {
    name: 'Camera',
    method: 'getPhoto',
    option: {},
  },
])
// CapacitorUpdater.
Camera.requestPermissions()
async function runMethod(m: Module) {
  console.log('runMethod', m)
  toast.success(`runMethod: ${JSON.stringify(m)}`);
  (mods as any)[m.name][m.method]({ ...m.option }).then((res: any) => {
    console.log('resMethod', m, res)
    setTimeout(async () => {
      toast.success(`resMethod: ${JSON.stringify(res)}`)
    }, 2000)
  }).catch((err: any) => {
    console.log('errMethod', m, err)
    setTimeout(async () => {
      toast.error(`errMethod: ${err}`)
    }, 2000)
  })
}
displayStore.NavTitle = `${t('module-heading')} ${t('tests')}`
displayStore.defaultBack = '/app/home'
// console.log('modules', modules.value)
</script>

<template>
  <div>
    <k-block-title>{{ t('available-in-the-san') }}</k-block-title>
    <k-list strong-ios outline-ios>
      <k-list-item
        v-for="(module, index) in modules" :key="index" link :footer="`with ${JSON.stringify(module.option)}`" :title="`${module.name}@${module.method}`" @click="runMethod(module)"
      />
    </k-list>
  </div>
</template>
