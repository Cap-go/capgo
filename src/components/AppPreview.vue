<script setup lang="ts">
import { Modal } from 'flowbite'
import { onMounted, ref, watch } from 'vue'
import type { ModalInterface, ModalOptions } from 'flowbite'
import { AppPreviewOptions, useDisplayStore } from '~/stores/display'
import { useI18n } from 'vue-i18n';
import { downloadUrl as downloadUrlRemote } from './../services/supabase'
import { toast } from 'vue-sonner';
import { ZipReader, BlobWriter } from '@zip.js/zip.js'
import mime from 'mime';
import { useRouter } from 'vue-router';

/*
* $targetEl: required
* options: optional
*/
const displayStore = useDisplayStore()
function close() {
  displayStore.showAppPreview = false
}

interface DownloadedBundle {
  files: {
    data: Blob;
    mime: string;
    filename: string;
  }[]
}

const modalElement = ref(null)
const mainIframe = ref(null as HTMLIFrameElement | null)
const loadingIframeClone = ref('')
const downloadedBundlesCache = ref(new Map<string, DownloadedBundle>())
const { t } = useI18n()
const router = useRouter()

async function prepareBundle(bundle: AppPreviewOptions) {
  console.log(`Download bundle ${bundle.version} for preview`)
  const bundleVersion = bundle.version

  let downloadUrl = ''
  if (bundleVersion.bucket_id) {
    downloadUrl = await downloadUrlRemote(bundleVersion.storage_provider, bundleVersion.user_id, bundleVersion.app_id, bundleVersion.bucket_id)
  } else {
    downloadUrl = bundleVersion.external_url ?? ''
  }

  let downloadedResponse = null as Response | null
  try {
    downloadedResponse = await fetch(downloadUrl)
  } catch (e) {
    console.error('network error', e)
    return undefined
  }
  

  if (!downloadedResponse.ok || !downloadedResponse.body) {
    console.error('download fail', downloadedResponse)
    return
  }

  const zipReader = new ZipReader(downloadedResponse.body)
  const entries = await zipReader.getEntries()

  const files = await Promise.all(entries.filter(entry => !entry.directory).map(async (entry) => {
    const mimeType = mime.getType(entry.filename)

    if (!entry.getData)
      return { ok: false, error: 'no_get_data', entry }

    if (!mimeType)
      return { ok: false, error: 'no_mime', entry }


    return {
      ok: true,
      data: await entry.getData!(new BlobWriter()),
      mime: mimeType,
      filename: `/${entry.filename}`
    }
  }))

  const errors = files.filter(file => !file.ok)
  errors.forEach(error => console.error(`Unzip error for ${error.entry}. Error: ${error.error}`))

  if (errors.length > 0) {
    return
  }

  const downloadedBundle: DownloadedBundle = {
    files: files
      .filter(file => file.ok)
      .map(file => {
        return { data: file.data!, mime: file.mime!, filename: file.filename! }
      })
  }
  downloadedBundlesCache.value.set(`${bundle.appId}-${bundle.version.id}`, downloadedBundle)
  return downloadedBundle
}

async function openBundlePreview(bundle: DownloadedBundle) {
  const iframe = mainIframe.value
  const controller = navigator.serviceWorker.controller
  const files = bundle.files

  if (!iframe || !controller) {
    console.error('Iframe not found or sw_controller', iframe, controller)
    toast.error(t('cannot-download'))
    close()
    return
  }

  // Clear service worker cache
  controller.postMessage({ name: 'clear-cache' })

  // Seed the cache
  files
    .forEach(file => {
      const msg = {
        name: 'cache-new',
        filename: file.filename,
        mime: file.mime,
        data: file.data
      }

      controller.postMessage(msg)
    })

  // Find index.html
  const indexHtmlFile = files.find(file => file.filename === '/index.html')
  if (!indexHtmlFile || !indexHtmlFile.data) {
    console.error('no index.html')
    toast.error(t('cannot-download'))
    close()
    return
  }

  // Set the iframe to index.html, service worker ready
  if (!loadingIframeClone.value) {
    loadingIframeClone.value = iframe.contentWindow?.document.documentElement.innerHTML ?? ''
  }

  iframe.contentWindow?.document.open()
  iframe.contentWindow?.document.write(await indexHtmlFile.data.text())
  iframe.contentDocument?.close()
}

function cleanUpPreview() {
  const iframe = mainIframe.value
  const controller = navigator.serviceWorker.controller

  if (!controller || !iframe) {
    console.error('no service worker controller or iframe', iframe, controller)
    return
  }

  controller.postMessage({ name: 'clear-cache' })

  const loadingIframe = loadingIframeClone.value

  if (!loadingIframe) {
    console.error('No loading iframe clone, cannot clean up')
    return
  }

  iframe.contentWindow?.document.open()
  iframe.contentWindow?.document.write(loadingIframe)
  iframe.contentDocument?.close()
}

onMounted(() => {
  navigator.serviceWorker
    .register('/preview-sw.js', { scope: '/' })
    .then(function () { console.log('Service Worker Registered'); })
    .catch(shit => console.error('shit1111', shit))

  const modalOptions: ModalOptions = {
    placement: 'center',
    backdrop: 'dynamic',
    backdropClasses: 'bg-gray-900 bg-opacity-50 dark:bg-opacity-80 fixed inset-0 z-40',
    closable: true,
    onHide: () => {
      console.log('modal is hidden')
      displayStore.showAppPreview = false
      cleanUpPreview()
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
  watch(() => displayStore.showAppPreview, async (val) => {
    const appPreview = displayStore.appPreview
    if (!appPreview)
      throw new Error('App preview not set!')

    if (val && modal) {
      modal.show()

      let bundle = downloadedBundlesCache.value.get(`${appPreview.appId}-${appPreview.version.id}`)

      // try to download the bundle
      if (!bundle)
        bundle = await prepareBundle(appPreview as any)

      // If that failed just close and inform end user
      if (!bundle) {
        toast.error(t('cannot-download'))
        close()
        return
      }

      // Now open that preview
      openBundlePreview(bundle)
    }
    else if (modal) {

      modal.hide()
    }
  })
})
</script>


<template>
  <div ref="modalElement" tabindex="-1" aria-hidden="true"
    class="fixed left-0 right-0 top-0 z-50 hidden h-[calc(100%-1rem)] w-full overflow-x-hidden overflow-y-auto p-4 md:inset-0 md:h-full">
    <div class="relative w-full h-full max-w-sm  md:h-auto">
      <!-- Modal content -->
      <div class="relative bg-white rounded-lg shadow dark:bg-gray-700">
        <!-- Modal header -->
        <div class="flex items-start justify-between p-4 border-b rounded-t dark:border-gray-600">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
            {{ t('app-preview') }}
          </h3>
          <button type="button"
            class="ml-auto inline-flex items-center rounded-lg bg-transparent p-1.5 text-sm text-gray-400 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-600 dark:hover:text-white"
            @click="close()">
            <svg aria-hidden="true" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd" />
            </svg>
            <span class="sr-only">Close modal</span>
          </button>
        </div>
        <!-- Modal body -->
        <div class="p-6 space-y-6 ml-auto mr-auto">
          <iframe src="/appPreviewFrame.html" ref="mainIframe" width="295" height="639" class="ml-auto mr-auto"
            frameborder="0"></iframe>
        </div>
      </div>
  </div>
</div></template>
