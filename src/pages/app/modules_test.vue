<script setup lang="ts">
import { Camera } from '@capacitor/camera'
import { Mute } from '@capgo/capacitor-mute'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { InAppBrowser } from '@capgo/inappbrowser'
import { NativeAudio } from '@capgo/native-audio'
import { NativeMarket } from '@capgo/native-market'
import { useI18n } from 'petite-vue-i18n'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import IconNext from '~icons/ic/round-keyboard-arrow-right'
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
  InAppBrowser,
  NativeAudio,
}
modules.value.push(...[
  // {
  //   name: '',
  //   method: '',
  //   option: {},
  // },
  {
    name: 'InAppBrowser',
    method: 'openWebView',
    option: {
      url: 'https://capacitorjs.com',
      title: 'Survey',
      showReloadButton: true,
      closeModal: true,
      closeModalTitle: 'Close this survey',
      closeModalDescription: 'Are you sure ? You cannot open it again.',
      closeModalOk: 'Bye',
      closeModalCancel: 'Stay',
    },
  },
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
    <div class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-300 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800">
      <dl class="divide-y dark:divide-slate-500 divide-slate-200">
        <InfoRow :label="t('available-in-the-san')" />
        <InfoRow v-for="(module, index) in modules" :key="index" :value="`with ${JSON.stringify(module.option)}`" :label="`${module.name}@${module.method}`" :is-link="true" @click="runMethod(module)">
          <button class="ml-auto bg-transparent w-7 h-7">
            <IconNext />
          </button>
        </InfoRow>
      </dl>
    </div>
  </div>
</template>
