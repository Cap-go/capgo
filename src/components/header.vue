<script setup lang="ts">
import { openChat } from '../services/crips'

const menuMobile = ref(false)
</script>

<template>
  <header class="relative py-4 md:py-6">
    <div class="px-4 pb-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
      <div class="relative flex items-center justify-between">
        <div class="flex-shrink-0">
          <a href="#" title="" class="flex rounded outline-none focus:ring-1 focus:ring-gray-900 focus:ring-offset-2">
            <img class="w-auto h-8 rounded-lg" alt="Capgo logo" src="/capgo.png">
          </a>
        </div>

        <div class="flex lg:hidden">
          <button type="button" class="text-white" @click="menuMobile = !menuMobile">
            <svg class="w-7 h-7" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <div class="hidden lg:absolute lg:inset-y-0 lg:flex lg:items-center lg:justify-center lg:space-x-12 lg:-translate-x-1/2 lg:left-1/2">
          <a href="/mobile_app" title="Sandbox App" class="text-base font-medium transition-all duration-200 rounded focus:outline-none font-pj hover:text-opacity-50 focus:ring-1 focus:ring-gray-900 focus:ring-offset-2"> App </a>
          <a href="https://doc.capgo.app" title="Documentation" target="_blank" class="text-base font-medium transition-all duration-200 rounded focus:outline-none font-pj hover:text-opacity-50 focus:ring-1 focus:ring-gray-900 focus:ring-offset-2"> Documentation </a>
          <a href="#" title="Support" class="text-base font-medium transition-all duration-200 rounded focus:outline-none font-pj hover:text-opacity-50 focus:ring-1 focus:ring-gray-900 focus:ring-offset-2" @click="openChat"> Support </a>
        </div>

        <div class="hidden lg:flex lg:items-center lg:justify-center lg:space-x-10">
          <a href="/login" title="" class="text-base font-medium transition-all duration-200 rounded focus:outline-none font-pj hover:text-opacity-50 focus:ring-1 focus:ring-gray-900 focus:ring-offset-2"> Login </a>

          <a
            href="https://discord.com/invite/VnYRvBfgA6"
            target="_blank"
            title="Join discord"
            class="
                            px-5
                            py-2
                            text-base
                            font-semibold
                            leading-7
                            text-gray-300
                            transition-all
                            duration-200
                            bg-transparent
                            border border-gray-300
                            rounded-xl
                            font-pj
                            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300
                            hover:bg-gray-500 hover:text-white
                            focus:bg-gray-500 focus:text-white
                        "
            role="button"
          >
            Join community
          </a>
        </div>
      </div>
    </div>
    <div :class="{'hidden': !menuMobile}">
      <div class="px-2 pt-2 pb-3 space-y-1 bg-gray-700">
        <!-- Current: "bg-gray-900 text-white", Default: "text-gray-300 hover:bg-gray-700 hover:text-white" -->

        <a href="/mobile_app" title="App" target="_blank" class="text-gray-300 hover:bg-gray-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">App</a>
        <a href="https://doc.capgo.app" title="Documentation" target="_blank" class="text-gray-300 hover:bg-gray-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Docummentation</a>

        <a href="#" class="text-gray-300 hover:bg-gray-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium" @click="openChat">Support</a>

        <a href="/login" title="Login" class="text-gray-300 hover:bg-gray-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Login</a>
        <a href="https://discord.com/invite/VnYRvBfgA6" title="Communauty" target="_blank" class="bg-gray-900 text-white block px-3 py-2 rounded-md text-base font-medium">Join community</a>
      </div>
    </div>
  </header>
</template>
