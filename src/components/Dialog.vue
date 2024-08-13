<script setup lang="ts">
import { onMounted, watch } from 'vue'
import DOMPurify from 'dompurify'
import { FormKit } from '@formkit/vue'
import type { ActionSheetOptionButton } from '~/stores/display'
import { useDisplayStore } from '~/stores/display'

/*
* $targetEl: required
* options: optional
*/
const displayStore = useDisplayStore()
const route = useRoute()

function close(item?: ActionSheetOptionButton) {
  if (displayStore?.dialogOption)
    displayStore.dialogOption.preventAccidentalClose = false
  if (!item?.preventClose)
    displayStore.showDialog = false
  if (item) {
    displayStore.lastButtonRole = item.id ?? ''
    if (item.role === 'cancel')
      displayStore.dialogCanceled = true

    else
      displayStore.dialogCanceled = false

    if (item?.handler)
      item.handler()
  }
}

function displayText(text?: string) {
  if (!text)
    return ''
  const sanitize = DOMPurify.sanitize(text.replace(/\n/g, '<br/>'))
  return sanitize
}

function submit(form: { text: string }) {
  displayStore.dialogInputText = form.text
}

onMounted(() => {
  // watch for changes
  watch(() => displayStore.showDialog, (val) => {
    if (val)
      displayStore.dialogCanceled = true
    else
      displayStore.dialogInputText = ''
  })

  addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && displayStore.showDialog && !displayStore?.dialogOption?.preventAccidentalClose)
      displayStore.showDialog = false
  })

  watch(route, () => {
    if (displayStore.showDialog)
      displayStore.showDialog = false
  })
})
</script>

<template>
  <dialog id="my_modal_1" class="modal" :open="displayStore.showDialog">
    <div class="bg-white modal-box dark:bg-base-100" :class="displayStore.dialogOption?.size ?? ''">
      <button class="absolute btn btn-sm btn-circle btn-ghost right-2 top-2" @click="close()">
        ✕
      </button>
      <h3 class="text-lg font-bold" :class="displayStore.dialogOption?.headerStyle">
        {{ displayStore.dialogOption?.header }}
      </h3>
      <div
        :class="{
          'py-4': !displayStore.dialogOption?.buttonVertical,
        }"
      >
        <p class="text-base leading-relaxed prose text-gray-500 break-words dark:text-gray-400" :class="displayStore.dialogOption?.textStyle" v-html="displayText(displayStore.dialogOption?.message)" />
        <img v-if="displayStore.dialogOption?.image" alt="dialog illustration" :src="displayStore.dialogOption?.image" class="ml-auto mr-auto">
        <div v-if="displayStore.dialogOption?.input" class="w-full">
          <FormKit id="dialog-input" type="form" :actions="false" @submit="submit">
            <FormKit
              v-model="displayStore.dialogInputText"
              type="text"
              name="text"
              enterkeyhint="next"
              validation="required:trim"
              :classes="{
                outer: '!mb-0',
                input: 'text-center',
                message: 'text-center',
              }"
            />
          </FormKit>
        </div>
      </div>
      <div class="modal-action">
        <div
          class="flex items-center w-full rounded-b dark:border-gray-600"
          :class="{
            'space-x-2': !displayStore.dialogOption?.buttonCenter,
            'flex-col mx-auto': displayStore.dialogOption?.buttonVertical,
          }"
        >
          <!-- if there is a button in form, it will close the modal -->
          <button
            v-for="(item, i) in displayStore.dialogOption?.buttons"
            :key="i"
            :class="{
              'btn btn-warning text-white': item.role === 'danger',
              'text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800': item.role !== 'cancel' && item.role !== 'danger',
              'text-gray-500 bg-white hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-blue-300 border border-gray-200 hover:text-gray-900 focus:z-10 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500 dark:hover:text-white dark:hover:bg-gray-600 dark:focus:ring-gray-600': item.role === 'cancel',
              'ml-auto mr-2': displayStore.dialogOption?.buttonCenter && i === 0 && (displayStore.dialogOption?.buttons?.length ?? 0) > 1,
              'mr-auto ml-2': displayStore.dialogOption?.buttonCenter && i === (displayStore.dialogOption?.buttons?.length ?? 0) - 1 && (displayStore.dialogOption?.buttons?.length ?? 0) > 1,
              'mx-auto': displayStore.dialogOption?.buttonCenter && (displayStore.dialogOption?.buttons?.length ?? 0) === 1,
              'my-1': displayStore.dialogOption?.buttonVertical && item.role !== 'cancel',
              'my-4': displayStore.dialogOption?.buttonVertical && item.role === 'cancel',
            }"
            class="btn rounded-lg px-5 py-2.5 text-center text-sm font-mediumtext-whitefocus:outline-none focus:ring-4"
            @click="close(item)"
          >
            {{ item.text }}
          </button>
        </div>
      </div>
    </div>
  </dialog>
</template>
