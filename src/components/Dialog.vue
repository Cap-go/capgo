<script setup lang="ts">
import type { ActionSheetOptionButton } from '~/stores/display'
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import DOMPurify from 'dompurify'
import { onMounted, watch } from 'vue'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'
/*
* $targetEl: required
* options: optional
*/
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const route = useRoute()

function calculateAcronym(name: string) {
  const words = name?.split(' ') || []
  let res = name?.slice(0, 2) || 'AP'
  if (words?.length > 2)
    res = words[0][0] + words[1][0]
  else if (words?.length > 1)
    res = words[0][0] + words[1][0]
  return res.toUpperCase()
}

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
  <div>
    <dialog id="my_modal_1" class="modal" :open="displayStore.showDialog">
      <div class="bg-white modal-box dark:bg-base-200" :class="displayStore.dialogOption?.size ?? ''">
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
          <div v-if="displayStore.dialogOption?.listOrganizations">
            <div class="flex flex-col gap-2">
              <div v-for="org in organizationStore.organizations" :key="org.gid" class="flex items-center gap-2">
                <div class="flex items-center h-full">
                  <FormKit
                    type="checkbox"
                    decorator-icon="check"
                    :name="`org-${org.gid}`"
                    :classes="{
                      outer: 'mb-0! ml-0 grow-0! h-[18px]!',
                      inner: 'max-w-[18px]!',
                      wrapper: 'mb-0!',
                    }"
                    @input="(value) => {
                      if (value)
                        displayStore.selectedOrganizations.push(org.gid)
                      else
                        displayStore.selectedOrganizations = displayStore.selectedOrganizations.filter(gid => gid !== org.gid)
                    }"
                  />
                </div>
                <img v-if="!!org.logo" :src="org.logo" :alt="org.name" class="w-[78px] h-[78px] rounded-full">
                <div v-else class="p-6 text-xl bg-gray-700 mask mask-squircle">
                  <span class="font-medium text-gray-300">
                    N/A
                  </span>
                </div>
                <span :class="{ 'ml-[6.344px]': !!org.logo }">{{ org.name }}</span>
              </div>
            </div>
          </div>
          <div v-if="displayStore.dialogOption?.listApps">
            <div class="flex flex-col gap-2">
              <div v-for="app in displayStore.dialogOption.listApps" :key="app.id!" class="flex items-center gap-2">
                <div class="flex items-center h-full">
                  <FormKit
                    type="checkbox"
                    decorator-icon="check"
                    :name="`app-${app.id}`"
                    :classes="{
                      outer: 'mb-0! ml-0 grow-0! h-[18px]!',
                      inner: 'max-w-[18px]! mr-2',
                      wrapper: 'mb-0!',
                    }"
                    @input="(value) => {
                      if (value)
                        displayStore.selectedApps.push(app as any)
                      else
                        displayStore.selectedApps = (displayStore.selectedApps as any).filter((filterApp: Database['public']['Tables']['apps']['Row']) => filterApp.app_id !== app.app_id)
                    }"
                  />
                </div>
                <img v-if="!!app.icon_url" :src="app.icon_url" class="w-[78px] h-[78px] rounded-full">
                <div v-else class="p-6 text-xl bg-gray-700 mask mask-squircle">
                  <span class="font-medium text-gray-300">
                    {{ calculateAcronym(app.name ?? 'Unknown App') }}
                  </span>
                </div>
                <span :class="{ 'ml-[6.344px]': !!app.icon_url }">{{ app.name }}</span>
              </div>
            </div>
          </div>
          <img v-if="displayStore.dialogOption?.image" alt="dialog illustration" :src="displayStore.dialogOption?.image" class="ml-auto mr-auto">
          <div v-if="displayStore.dialogOption?.checkboxText" class="flex justify-start" :class="displayStore.dialogOption?.checkboxStyle">
            <FormKit id="dialog-input" type="form" :actions="false">
              <FormKit
                v-model="displayStore.dialogCheckbox"
                type="checkbox"
                decorator-icon="check"
                :label="displayStore.dialogOption?.checkboxText"
                :classes="{
                  outer: 'mb-0! ml-0 grow-0! h-[18px]!',
                  inner: 'max-w-[18px]! mr-2',
                  wrapper: 'mb-0!',
                }"
              />
            </FormKit>
          </div>
          <div v-if="displayStore.dialogOption?.input" class="w-full">
            <FormKit id="dialog-input" type="form" :actions="false" @submit="submit">
              <FormKit
                v-model="displayStore.dialogInputText"
                type="text"
                name="text"
                data-test="dialog-input-text"
                enterkeyhint="next"
                validation="required:trim"
                :classes="{
                  outer: 'mb-0!',
                  input: 'text-center',
                  message: 'text-center',
                }"
              />
            </FormKit>
          </div>
        </div>
        <div class="modal-action" :class="{ 'mt-0': displayStore.dialogOption?.checkboxText }">
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
                'text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-hidden focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800': item.role !== 'cancel' && item.role !== 'danger',
                'text-gray-500 bg-white hover:bg-gray-100 focus:ring-4 focus:outline-hidden focus:ring-blue-300 border border-gray-200 hover:text-gray-900 focus:z-10 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500 dark:hover:text-white dark:hover:bg-gray-600 dark:focus:ring-gray-600': item.role === 'cancel',
                'ml-auto mr-2': displayStore.dialogOption?.buttonCenter && i === 0 && (displayStore.dialogOption?.buttons?.length ?? 0) > 1,
                'mr-auto ml-2': displayStore.dialogOption?.buttonCenter && i === (displayStore.dialogOption?.buttons?.length ?? 0) - 1 && (displayStore.dialogOption?.buttons?.length ?? 0) > 1,
                'mx-auto': displayStore.dialogOption?.buttonCenter && (displayStore.dialogOption?.buttons?.length ?? 0) === 1,
                'my-1 mx-auto!': displayStore.dialogOption?.buttonVertical && item.role !== 'cancel',
                'my-4 mx-auto!': displayStore.dialogOption?.buttonVertical && item.role === 'cancel',
              }"
              class="btn rounded-lg px-5 py-2.5 text-center text-sm font-mediumtext-whitefocus:outline-none focus:ring-4"
              :data-test="item.id || item.text"
              @click="close(item)"
            >
              {{ item.text }}
            </button>
          </div>
        </div>
      </div>
    </dialog>
    <div v-if="displayStore.showDialog" class="fixed inset-0 z-40 bg-black/50" @click="close()" />
  </div>
</template>
