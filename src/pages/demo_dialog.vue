<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDialogV2Store } from '~/stores/dialogv2'

const dialogStore = useDialogV2Store()
const customInputValue = ref('')
const { t } = useI18n()

// Demo 1: Basic dialog
function openBasicDialog() {
  dialogStore.openDialog({
    title: 'Basic Dialog',
    description: 'This is a basic dialog with default content.',
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel',
      },
      {
        text: 'Confirm',
        role: 'primary',
        handler: () => {
          console.log('Confirmed!')
        },
      },
    ],
  })
}

// Demo 2: Dialog with teleported input
function openInputDialog() {
  dialogStore.openDialog({
    title: t('dialog-with-custom-input'),
    description: 'This dialog has a custom input field teleported into it.',
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel',
      },
      {
        text: 'Submit',
        role: 'primary',
        handler: () => {
          console.log(`Input value: ${customInputValue.value}`)
          customInputValue.value = ''
        },
      },
    ],
  })
}

// Demo 3: Danger dialog
function openDangerDialog() {
  dialogStore.openDialog({
    title: 'Danger Zone',
    description: 'This action cannot be undone.',
    size: 'lg',
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel',
      },
      {
        text: 'Delete Forever',
        role: 'danger',
        handler: () => {
          console.log('Deleted!')
        },
      },
    ],
  })
}

// Demo 4: Complex form dialog
function openFormDialog() {
  dialogStore.openDialog({
    title: t('user-registration'),
    size: 'xl',
    buttons: [
      {
        text: t('cancel'),
        role: 'cancel',
      },
      {
        text: t('register'),
        role: 'primary',
        handler: () => {
          console.log('User registered!')
        },
      },
    ],
  })
}

// Reactive input value that can be read from outside
const externalInputValue = ref('')

function readExternalInput() {
  console.log(`External input value: ${externalInputValue.value}`)
}
</script>

<template>
  <div class="container mx-auto p-8 space-y-8">
    <div class="text-center">
      <h1 class="text-3xl font-bold mb-4">
        DialogV2 Demo
      </h1>
      <p class="text-gray-600 dark:text-gray-400 mb-8">
        Demonstrates DialogV2 component with Vue Teleport functionality
      </p>
    </div>

    <!-- Demo Controls -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <button
        class="btn btn-primary"
        @click="openBasicDialog"
      >
        Basic Dialog
      </button>

      <button
        class="btn btn-secondary"
        @click="openInputDialog"
      >
        Dialog with Input
      </button>

      <button
        class="btn btn-error"
        @click="openDangerDialog"
      >
        Danger Dialog
      </button>

      <button
        class="btn btn-accent"
        @click="openFormDialog"
      >
        Form Dialog
      </button>
    </div>

    <!-- External Input Demo -->
    <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <h2 class="text-xl font-semibold mb-4">
        External Input Reading Demo
      </h2>
      <div class="flex gap-4 items-center">
        <input
          v-model="externalInputValue"
          type="text"
          placeholder="Type something here..."
          class="input input-bordered flex-1"
        >
        <button
          class="btn btn-outline"
          @click="readExternalInput"
        >
          Read Value
        </button>
      </div>
      <p class="text-sm text-gray-500 mt-2">
        This demonstrates reading input values from components outside the dialog
      </p>
    </div>

    <!-- Teleport Content for Input Dialog -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('dialog-with-custom-input')" defer to="#dialog-v2-content">
      <div class="space-y-4">
        <div>
          <label for="custom-input" class="block text-sm font-medium mb-2">Custom Input Field</label>
          <input
            v-model="customInputValue"
            type="text"
            placeholder="Enter your text here..."
            class="input input-bordered w-full"
          >
        </div>
        <div class="text-sm text-gray-500">
          This input is teleported into the dialog content area
        </div>
      </div>
    </Teleport>

    <!-- Teleport Content for Form Dialog -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('user-registration')" to="#dialog-v2-content">
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="first-name" class="block text-sm font-medium mb-2">First Name</label>
            <input
              type="text"
              placeholder="John"
              class="input input-bordered w-full"
            >
          </div>
          <div>
            <label for="last-name" class="block text-sm font-medium mb-2">Last Name</label>
            <input
              type="text"
              placeholder="Doe"
              class="input input-bordered w-full"
            >
          </div>
        </div>

        <div>
          <label for="email" class="block text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            placeholder="john.doe@example.com"
            class="input input-bordered w-full"
          >
        </div>

        <div>
          <label for="role" class="block text-sm font-medium mb-2">Role</label>
          <select class="select select-bordered w-full">
            <option disabled selected>
              Select a role
            </option>
            <option>Developer</option>
            <option>Designer</option>
            <option>Manager</option>
          </select>
        </div>

        <div class="flex items-center gap-2">
          <input
            id="terms"
            type="checkbox"
            class="checkbox"
          >
          <label for="terms" class="text-sm">
            I agree to the terms and conditions
          </label>
        </div>

        <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <p class="text-sm text-blue-700 dark:text-blue-300">
            This entire form is teleported into the dialog using Vue Teleport!
          </p>
        </div>
      </div>
    </Teleport>

    <!-- Code Examples -->
    <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <h2 class="text-xl font-semibold mb-4">
        Usage Examples
      </h2>

      <div class="space-y-4">
        <div>
          <h3 class="font-medium mb-2">
            1. Basic Dialog
          </h3>
          <pre class="bg-gray-100 dark:bg-gray-700 p-3 rounded text-sm overflow-x-auto"><code>dialogStore.openDialog({
  title: 'Basic Dialog',
  description: 'This is a basic dialog.',
  buttons: [
    { text: 'Cancel', role: 'cancel' },
    { text: 'Confirm', role: 'primary', handler: () => alert('Confirmed!') }
  ]
})</code></pre>
        </div>

        <div>
          <h3 class="font-medium mb-2">
            2. Dialog with Teleported Content
          </h3>
          <pre class="bg-gray-100 dark:bg-gray-700 p-3 rounded text-sm overflow-x-auto"><code>&lt;Teleport to="#dialog-v2-content" v-if="dialogStore.showDialog"&gt;
  &lt;input v-model="customValue" class="input input-bordered w-full" /&gt;
&lt;/Teleport&gt;</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>
