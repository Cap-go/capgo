<script>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import SidebarLinkGroup from './SidebarLinkGroup.vue'

export default {
  name: 'Sidebar',
  components: {
    SidebarLinkGroup,
  },
  props: ['sidebarOpen'],
  emits: ['closeSidebar'],
  setup(props, { emit }) {
    const trigger = ref(null)
    const sidebar = ref(null)

    const storedSidebarExpanded = localStorage.getItem('sidebar-expanded')
    const sidebarExpanded = ref(storedSidebarExpanded === null ? false : storedSidebarExpanded === 'true')

    const currentRoute = useRouter().currentRoute.value

    // close on click outside
    const clickHandler = ({ target }) => {
      if (!sidebar.value || !trigger.value)
        return
      if (
        !props.sidebarOpen
        || sidebar.value.contains(target)
        || trigger.value.contains(target)
      ) return
      emit('closeSidebar')
    }

    // close if the esc key is pressed
    const keyHandler = ({ keyCode }) => {
      if (!props.sidebarOpen || keyCode !== 27)
        return
      emit('closeSidebar')
    }

    onMounted(() => {
      document.addEventListener('click', clickHandler)
      document.addEventListener('keydown', keyHandler)
    })

    onUnmounted(() => {
      document.removeEventListener('click', clickHandler)
      document.removeEventListener('keydown', keyHandler)
    })

    watch(sidebarExpanded, () => {
      localStorage.setItem('sidebar-expanded', sidebarExpanded.value)
      if (sidebarExpanded.value)
        document.querySelector('body').classList.add('sidebar-expanded')
      else
        document.querySelector('body').classList.remove('sidebar-expanded')
    })

    return {
      trigger,
      sidebar,
      sidebarExpanded,
      currentRoute,
    }
  },
}
</script>

<template>
  <div>
    <!-- Sidebar backdrop (mobile only) -->
    <div class="fixed inset-0 bg-slate-900 bg-opacity-30 z-40 lg:hidden lg:z-auto transition-opacity duration-200" :class="sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'" aria-hidden="true" />

    <!-- Sidebar -->
    <div
      id="sidebar"
      ref="sidebar"
      class="flex flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-screen overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 lg:w-20 lg:sidebar-expanded:!w-64 2xl:!w-64 shrink-0 bg-slate-800 p-4 transition-all duration-200 ease-in-out"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-64'"
    >
      <!-- Sidebar header -->
      <div class="flex justify-between mb-10 pr-3 sm:px-2">
        <!-- Close button -->
        <button
          ref="trigger"
          class="lg:hidden text-slate-500 hover:text-slate-400"
          aria-controls="sidebar"
          :aria-expanded="sidebarOpen"
          @click.stop="$emit('closeSidebar')"
        >
          <span class="sr-only">Close sidebar</span>
          <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z" />
          </svg>
        </button>
        <!-- Logo -->
        <router-link class="block" to="/">
          <svg width="32" height="32" viewBox="0 0 32 32">
            <defs>
              <linearGradient id="logo-a" x1="28.538%" y1="20.229%" x2="100%" y2="108.156%">
                <stop stop-color="#A5B4FC" stop-opacity="0" offset="0%" />
                <stop stop-color="#A5B4FC" offset="100%" />
              </linearGradient>
              <linearGradient id="logo-b" x1="88.638%" y1="29.267%" x2="22.42%" y2="100%">
                <stop stop-color="#38BDF8" stop-opacity="0" offset="0%" />
                <stop stop-color="#38BDF8" offset="100%" />
              </linearGradient>
            </defs>
            <rect fill="#6366F1" width="32" height="32" rx="16" />
            <path d="M18.277.16C26.035 1.267 32 7.938 32 16c0 8.837-7.163 16-16 16a15.937 15.937 0 01-10.426-3.863L18.277.161z" fill="#4F46E5" />
            <path d="M7.404 2.503l18.339 26.19A15.93 15.93 0 0116 32C7.163 32 0 24.837 0 16 0 10.327 2.952 5.344 7.404 2.503z" fill="url(#logo-a)" />
            <path d="M2.223 24.14L29.777 7.86A15.926 15.926 0 0132 16c0 8.837-7.163 16-16 16-5.864 0-10.991-3.154-13.777-7.86z" fill="url(#logo-b)" />
          </svg>
        </router-link>
      </div>

      <!-- Links -->
      <div class="space-y-8">
        <!-- Pages group -->
        <div>
          <h3 class="text-xs uppercase text-slate-500 font-semibold pl-3">
            <span class="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6" aria-hidden="true">•••</span>
            <span class="lg:hidden lg:sidebar-expanded:block 2xl:block">Pages</span>
          </h3>
          <ul class="mt-3">
            <!-- Dashboard -->
            <li class="px-3 py-2 rounded-sm mb-0.5 last:mb-0">
              <a class="block text-slate-200 hover:text-white truncate transition duration-150" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('dashboard')) && 'hover:text-slate-200'" href="/app/home">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <svg class="shrink-0 h-6 w-6" viewBox="0 0 24 24">
                      <path class="fill-current text-slate-400" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('dashboard')) && '!text-indigo-500'" d="M12 0C5.383 0 0 5.383 0 12s5.383 12 12 12 12-5.383 12-12S18.617 0 12 0z" />
                      <path class="fill-current text-slate-600" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('dashboard')) && 'text-indigo-600'" d="M12 3c-4.963 0-9 4.037-9 9s4.037 9 9 9 9-4.037 9-9-4.037-9-9-9z" />
                      <path class="fill-current text-slate-400" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('dashboard')) && 'text-indigo-200'" d="M12 15c-1.654 0-3-1.346-3-3 0-.462.113-.894.3-1.285L6 6l4.714 3.301A2.973 2.973 0 0112 9c1.654 0 3 1.346 3 3s-1.346 3-3 3z" />
                    </svg>
                    <span class="text-sm font-medium ml-3 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Dashboard</span>
                  </div>

                </div>
              </a>
            </li>

            <!-- Settings -->
            <SidebarLinkGroup v-slot="parentLink" :active-condition="currentRoute.fullPath.includes('settings')">
              <a class="block text-slate-200 hover:text-white truncate transition duration-150" :class="currentRoute.fullPath.includes('settings') && 'hover:text-slate-200'" href="#0" @click.prevent="sidebarExpanded ? parentLink.handleClick() : sidebarExpanded = true">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <svg class="shrink-0 h-6 w-6" viewBox="0 0 24 24">
                      <path class="fill-current text-slate-600" :class="currentRoute.fullPath.includes('settings') && 'text-indigo-500'" d="M19.714 14.7l-7.007 7.007-1.414-1.414 7.007-7.007c-.195-.4-.298-.84-.3-1.286a3 3 0 113 3 2.969 2.969 0 01-1.286-.3z" />
                      <path class="fill-current text-slate-400" :class="currentRoute.fullPath.includes('settings') && 'text-indigo-300'" d="M10.714 18.3c.4-.195.84-.298 1.286-.3a3 3 0 11-3 3c.002-.446.105-.885.3-1.286l-6.007-6.007 1.414-1.414 6.007 6.007z" />
                      <path class="fill-current text-slate-600" :class="currentRoute.fullPath.includes('settings') && 'text-indigo-500'" d="M5.7 10.714c.195.4.298.84.3 1.286a3 3 0 11-3-3c.446.002.885.105 1.286.3l7.007-7.007 1.414 1.414L5.7 10.714z" />
                      <path class="fill-current text-slate-400" :class="currentRoute.fullPath.includes('settings') && 'text-indigo-300'" d="M19.707 9.292a3.012 3.012 0 00-1.415 1.415L13.286 5.7c-.4.195-.84.298-1.286.3a3 3 0 113-3 2.969 2.969 0 01-.3 1.286l5.007 5.006z" />
                    </svg>
                    <span class="text-sm font-medium ml-3 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Settings</span>
                  </div>
                  <!-- Icon -->
                  <div class="flex shrink-0 ml-2">
                    <svg class="w-3 h-3 shrink-0 ml-1 fill-current text-slate-400" :class="parentLink.expanded && 'rotate-180'" viewBox="0 0 12 12">
                      <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
                    </svg>
                  </div>
                </div>
              </a>
              <div class="lg:hidden lg:sidebar-expanded:block 2xl:block">
                <ul class="pl-9 mt-1" :class="!parentLink.expanded && 'hidden'">
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/dashboard/settings/account" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">My Account</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/dashboard/settings/notifications" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">My Notifications</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/dashboard/settings/apps" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Connected Apps</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/dashboard/settings/plans" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Plans</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/dashboard/settings/billing" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Billing & Invoices</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/dashboard/settings/feedback" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Give Feedback</span>
                      </a>
                    </li>
                  </router-link>
                </ul>
              </div>
            </SidebarLinkGroup>
            <!-- Utility -->
            <SidebarLinkGroup v-slot="parentLink" :active-condition="currentRoute.fullPath.includes('utility')">
              <a class="block text-slate-200 hover:text-white truncate transition duration-150" :class="currentRoute.fullPath.includes('utility') && 'hover:text-slate-200'" href="#0" @click.prevent="sidebarExpanded ? parentLink.handleClick() : sidebarExpanded = true">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <svg class="shrink-0 h-6 w-6" viewBox="0 0 24 24">
                      <circle class="fill-current text-slate-400" :class="currentRoute.fullPath.includes('utility') && 'text-indigo-300'" cx="18.5" cy="5.5" r="4.5" />
                      <circle class="fill-current text-slate-600" :class="currentRoute.fullPath.includes('utility') && 'text-indigo-500'" cx="5.5" cy="5.5" r="4.5" />
                      <circle class="fill-current text-slate-600" :class="currentRoute.fullPath.includes('utility') && 'text-indigo-500'" cx="18.5" cy="18.5" r="4.5" />
                      <circle class="fill-current text-slate-400" :class="currentRoute.fullPath.includes('utility') && 'text-indigo-300'" cx="5.5" cy="18.5" r="4.5" />
                    </svg>
                    <span class="text-sm font-medium ml-3 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Utility</span>
                  </div>
                  <!-- Icon -->
                  <div class="flex shrink-0 ml-2">
                    <svg class="w-3 h-3 shrink-0 ml-1 fill-current text-slate-400" :class="parentLink.expanded && 'rotate-180'" viewBox="0 0 12 12">
                      <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
                    </svg>
                  </div>
                </div>
              </a>
              <div class="lg:hidden lg:sidebar-expanded:block 2xl:block">
                <ul class="pl-9 mt-1" :class="!parentLink.expanded && 'hidden'">
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/utility/changelog" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Changelog</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/utility/roadmap" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Roadmap</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/utility/faqs" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">FAQs</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/utility/empty-state" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Empty State</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/utility/404" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">404</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/utility/knowledge-base" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Knowledge Base</span>
                      </a>
                    </li>
                  </router-link>
                </ul>
              </div>
            </SidebarLinkGroup>
          </ul>
        </div>
        <!-- More group -->
        <div>
          <h3 class="text-xs uppercase text-slate-500 font-semibold pl-3">
            <span class="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6" aria-hidden="true">•••</span>
            <span class="lg:hidden lg:sidebar-expanded:block 2xl:block">More</span>
          </h3>
          <ul class="mt-3">
            <!-- Authentication -->
            <SidebarLinkGroup v-slot="parentLink">
              <a class="block text-slate-200 hover:text-white truncate transition duration-150" :class="parentLink.expanded && 'hover:text-slate-200'" href="#0" @click.prevent="sidebarExpanded ? parentLink.handleClick() : sidebarExpanded = true">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <svg class="shrink-0 h-6 w-6" viewBox="0 0 24 24">
                      <path class="fill-current text-slate-600" d="M8.07 16H10V8H8.07a8 8 0 110 8z" />
                      <path class="fill-current text-slate-400" d="M15 12L8 6v5H0v2h8v5z" />
                    </svg>
                    <span class="text-sm font-medium ml-3 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Authentication</span>
                  </div>
                  <!-- Icon -->
                  <div class="flex shrink-0 ml-2">
                    <svg class="w-3 h-3 shrink-0 ml-1 fill-current text-slate-400" :class="parentLink.expanded && 'rotate-180'" viewBox="0 0 12 12">
                      <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
                    </svg>
                  </div>
                </div>
              </a>
              <div class="lg:hidden lg:sidebar-expanded:block 2xl:block">
                <ul class="pl-9 mt-1" :class="!parentLink.expanded && 'hidden'">
                  <router-link v-slot="{ href, navigate }" to="/signin" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Sign in</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate }" to="/signup" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Sign up</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate }" to="/reset-password" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Reset Password</span>
                      </a>
                    </li>
                  </router-link>
                </ul>
              </div>
            </SidebarLinkGroup>
            <!-- Onboarding -->
            <SidebarLinkGroup v-slot="parentLink">
              <a class="block text-slate-200 hover:text-white truncate transition duration-150" :class="parentLink.expanded && 'hover:text-slate-200'" href="#0" @click.prevent="sidebarExpanded ? parentLink.handleClick() : sidebarExpanded = true">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <svg class="shrink-0 h-6 w-6" viewBox="0 0 24 24">
                      <path class="fill-current text-slate-600" d="M19 5h1v14h-2V7.414L5.707 19.707 5 19H4V5h2v11.586L18.293 4.293 19 5Z" />
                      <path class="fill-current text-slate-400" d="M5 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm14 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8ZM5 23a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm14 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
                    </svg>
                    <span class="text-sm font-medium ml-3 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Onboarding</span>
                  </div>
                  <!-- Icon -->
                  <div class="flex shrink-0 ml-2">
                    <svg class="w-3 h-3 shrink-0 ml-1 fill-current text-slate-400" :class="parentLink.expanded && 'rotate-180'" viewBox="0 0 12 12">
                      <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
                    </svg>
                  </div>
                </div>
              </a>
              <div class="lg:hidden lg:sidebar-expanded:block 2xl:block">
                <ul class="pl-9 mt-1" :class="!parentLink.expanded && 'hidden'">
                  <router-link v-slot="{ href, navigate }" to="/onboarding-01" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Step 1</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate }" to="/onboarding-02" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Step 2</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate }" to="/onboarding-03" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Step 3</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate }" to="/onboarding-04" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Step 4</span>
                      </a>
                    </li>
                  </router-link>
                </ul>
              </div>
            </SidebarLinkGroup>
            <!-- Components  -->
            <SidebarLinkGroup v-slot="parentLink" :active-condition="currentRoute.fullPath.includes('component')">
              <a class="block text-slate-200 hover:text-white truncate transition duration-150" :class="currentRoute.fullPath.includes('component') && 'hover:text-slate-200'" href="#0" @click.prevent="sidebarExpanded ? parentLink.handleClick() : sidebarExpanded = true">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <svg class="shrink-0 h-6 w-6" viewBox="0 0 24 24">
                      <circle class="fill-current text-slate-600" :class="currentRoute.fullPath.includes('component') && 'text-indigo-500'" cx="16" cy="8" r="8" />
                      <circle class="fill-current text-slate-400" :class="currentRoute.fullPath.includes('component') && 'text-indigo-300'" cx="8" cy="16" r="8" />
                    </svg>
                    <span class="text-sm font-medium ml-3 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Components </span>
                  </div>
                  <!-- Icon -->
                  <div class="flex shrink-0 ml-2">
                    <svg class="w-3 h-3 shrink-0 ml-1 fill-current text-slate-400" :class="parentLink.expanded && 'rotate-180'" viewBox="0 0 12 12">
                      <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
                    </svg>
                  </div>
                </div>
              </a>
              <div class="lg:hidden lg:sidebar-expanded:block 2xl:block">
                <ul class="pl-9 mt-1" :class="!parentLink.expanded && 'hidden'">
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/button" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Button</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/form" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Input Form</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/dropdown" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Dropdown</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/alert" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Alert & Banner</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/modal" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Modal</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/pagination" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Pagination</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/tabs" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Tabs</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/breadcrumb" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Breadcrumb</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/badge" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Badge</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/avatar" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Avatar</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/tooltip" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Tooltip</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/accordion" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Accordion</span>
                      </a>
                    </li>
                  </router-link>
                  <router-link v-slot="{ href, navigate, isExactActive }" to="/component/icons" custom>
                    <li class="mb-1 last:mb-0">
                      <a class="block text-slate-400 hover:text-slate-200 transition duration-150 truncate" :class="isExactActive && '!text-indigo-500'" :href="href" @click="navigate">
                        <span class="text-sm font-medium lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Icons</span>
                      </a>
                    </li>
                  </router-link>
                </ul>
              </div>
            </SidebarLinkGroup>
          </ul>
        </div>
      </div>

      <!-- Expand / collapse button -->
      <div class="pt-3 hidden lg:inline-flex 2xl:hidden justify-end mt-auto">
        <div class="px-3 py-2">
          <button @click.prevent="sidebarExpanded = !sidebarExpanded">
            <span class="sr-only">Expand / collapse sidebar</span>
            <svg class="w-6 h-6 fill-current sidebar-expanded:rotate-180" viewBox="0 0 24 24">
              <path class="text-slate-400" d="M19.586 11l-5-5L16 4.586 23.414 12 16 19.414 14.586 18l5-5H7v-2z" />
              <path class="text-slate-600" d="M3 23H1V1h2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
