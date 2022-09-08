<script setup lang="ts">
import { ref } from 'vue'
import { openChat } from '../../services/crips'

const dropdownOpen = ref(false)
const trigger = ref(null)
const dropdown = ref(null)
</script>

<template>
  <div class="relative inline-flex">
    <button
      ref="trigger"
      class="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition duration-150 rounded-full"
      :class="{ 'bg-slate-200': dropdownOpen }"
      aria-haspopup="true"
      :aria-expanded="dropdownOpen"
      @click.prevent="dropdownOpen = !dropdownOpen"
    >
      <span class="sr-only">Info</span>
      <svg class="w-4 h-4" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path class="fill-current text-slate-500" d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z" />
      </svg>
    </button>
    <transition
      enter-active-class="transition ease-out duration-200 transform"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-out duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-show="dropdownOpen" class="origin-top-right z-10 absolute top-full min-w-44 bg-white border border-slate-200 py-1.5 rounded shadow-lg overflow-hidden mt-1">
        <div class="text-xs text-left font-semibold text-slate-400 uppercase pt-1.5 pb-2 px-3">
          Need help?
        </div>
        <ul
          ref="dropdown"
          @focusin="dropdownOpen = true"
          @focusout="dropdownOpen = false"
        >
          <li>
            <a class="font-medium text-sm text-blue-500 hover:text-blue-600 flex items-center py-1 px-3" target="_blank" rel="noreferrer" href="https://docs.capgo.app/" @click="dropdownOpen = false">
              <svg class="w-3 h-3 fill-current text-blue-300 shrink-0 mr-2" viewBox="0 0 12 12">
                <rect y="3" width="12" height="9" rx="1" />
                <path d="M2 0h8v2H2z" />
              </svg>
              <span>Documentation</span>
            </a>
          </li>
          <li>
            <a class="font-medium text-sm text-blue-500 hover:text-blue-600 flex items-center py-1 px-3 cursor-pointer" @click="openChat">
              <svg class="w-3 h-3 fill-current text-blue-300 shrink-0 mr-2" viewBox="0 0 12 12">
                <path d="M11.854.146a.5.5 0 00-.525-.116l-11 4a.5.5 0 00-.015.934l4.8 1.921 1.921 4.8A.5.5 0 007.5 12h.008a.5.5 0 00.462-.329l4-11a.5.5 0 00-.116-.525z" />
              </svg>
              <span @click="openChat">Contact us</span>
            </a>
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>
