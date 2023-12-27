<script setup lang="ts">
import { Modal } from 'flowbite'
import { onMounted, ref, watch } from 'vue'
import type { ModalInterface, ModalOptions } from 'flowbite'
import { AppPreviewOptions, useDisplayStore } from '~/stores/display'
import { useI18n } from 'vue-i18n';
import { downloadUrl as downloadUrlRemote } from './../services/supabase'
import { toast } from 'vue-sonner';
import { ZipReader } from '@zip.js/zip.js'

/*
* $targetEl: required
* options: optional
*/
const displayStore = useDisplayStore()
function close() {
  displayStore.showAppPreview = false
}

interface DownloadedBundle {
  files: string
}

const modalElement = ref(null)
const frameSrc = ref('')
const downloadedBundlesCache = ref(new Map<string, DownloadedBundle>())
const { t } = useI18n()

async function prepareBundle(bundle: AppPreviewOptions) {
  console.log('Download!', bundle)

  const bundleVersion = bundle.version

  let downloadUrl = ''
  if (bundleVersion.bucket_id) {
    downloadUrl = await downloadUrlRemote(bundleVersion.storage_provider, bundleVersion.user_id, bundleVersion.app_id, bundleVersion.bucket_id)
  } else {
    downloadUrl = bundleVersion.external_url ?? ''
  }

  console.log(downloadUrl)

  const downloadedResponse = await fetch(downloadUrl)

  if (!downloadedResponse.ok || !downloadedResponse.body) {
    toast.error(t('cannot-download'))
    close()
    return
  }

  const zipReader = new ZipReader(downloadedResponse.body)
  const entries = await zipReader.getEntries()

  console.log(entries)

  const downloadedBundle: DownloadedBundle = {
    files: ''
  }
  downloadedBundlesCache.value.set(`${bundle.appId}-${bundle.version.id}`, downloadedBundle)
}

onMounted(() => {
  frameSrc.value = import.meta.env.appPreviewHtml
  const modalOptions: ModalOptions = {
    placement: 'center',
    backdrop: 'dynamic',
    backdropClasses: 'bg-gray-900 bg-opacity-50 dark:bg-opacity-80 fixed inset-0 z-40',
    closable: true,
    onHide: () => {
      console.log('modal is hidden')
      displayStore.showAppPreview = false
    },
    onShow: () => {
      console.log('modal is shown')
    },
    onToggle: () => {
      console.log('modal has been toggled')
    },
  }

  const modal: ModalInterface = new Modal(modalElement.value, modalOptions)

  // watch for changes
  watch(() => displayStore.showAppPreview, (val) => {
    const appPreview = displayStore.appPreview
    if (!appPreview)
      throw new Error('App preview not set!')

    if (val && modal) {
      modal.show()

      if (!downloadedBundlesCache.value.get(`${appPreview.appId}-${appPreview.version.id}`))
        // idk why do I need `as any`. I get `Type instantiation is excessively deep and possibly infinite` otherwise
        prepareBundle(appPreview as any)
      else {
        console.log('we have it!~')
        // idk why do I need `as any`. I get `Type instantiation is excessively deep and possibly infinite` otherwise
        prepareBundle(appPreview as any)
      }
    }
    else if (modal) {
      modal.hide()
    }
  })
})
</script>


<template>
  <div
    ref="modalElement" tabindex="-1"
    aria-hidden="true"
    class="fixed left-0 right-0 top-0 z-50 hidden h-[calc(100%-1rem)] w-full overflow-x-hidden overflow-y-auto p-4 md:inset-0 md:h-full"
  >
    <div class="relative w-full h-full max-w-sm  md:h-auto">
      <!-- Modal content -->
      <div class="relative bg-white rounded-lg shadow dark:bg-gray-700">
        <!-- Modal header -->
        <div class="flex items-start justify-between p-4 border-b rounded-t dark:border-gray-600">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
            {{ t('app-preview') }}
          </h3>
          <button type="button" class="ml-auto inline-flex items-center rounded-lg bg-transparent p-1.5 text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-600 dark:hover:text-white" @click="close()">
            <svg aria-hidden="true" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
            <span class="sr-only">Close modal</span>
          </button>
        </div>
        <!-- Modal body -->
        <div class="p-6 space-y-6 ml-auto mr-auto">
          <iframe :srcdoc="frameSrc" width="295" height="639" class="ml-auto mr-auto" frameborder="0"></iframe>
        </div>
      </div>
    </div>
  </div>
</template>
