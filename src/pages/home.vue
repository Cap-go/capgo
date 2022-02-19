
<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import { openChat } from '../services/crips'
</script>
<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="overflow-x-hidden bg-gray-900 text-white">
        <header class="relative py-4 md:py-6">
          <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div class="relative flex items-center justify-between">
              <div class="flex-shrink-0">
                <a href="#" title="" class="flex rounded outline-none focus:ring-1 focus:ring-gray-900 focus:ring-offset-2">
                  <img class="w-auto h-8" alt="Capgo logo" src="/capgo.png">
                </a>
              </div>

              <div class="flex lg:hidden">
                <button type="button" class="text-gray-900">
                  <svg class="w-7 h-7" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>

              <div class="hidden lg:absolute lg:inset-y-0 lg:flex lg:items-center lg:justify-center lg:space-x-12 lg:-translate-x-1/2 lg:left-3/5">
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
        </header>

        <section class="relative py-12 sm:py-16 lg:pt-20 xl:pb-0">
          <div class="relative px-4 mx-auto sm:px-6 lg:px-8 max-w-7xl">
            <div class="max-w-3xl mx-auto text-center">
              <p class="inline-flex px-4 py-2 text-base border border-gray-200 rounded-full font-pj">
                Made by Developers, for Developers
              </p>
              <h1 class="mt-5 text-4xl font-bold leading-tight sm:text-5xl sm:leading-tight lg:text-6xl lg:leading-tight font-pj">
                Make one webapp, run it everywhere
              </h1>
              <p class="max-w-md mx-auto mt-6 text-base leading-7 text-gray-600 font-inter">
                Build one project that runs on all your users' devices with native features.
              </p>

              <div class="relative inline-flex mt-10 group">
                <div class="absolute transitiona-all duration-1000 opacity-70 -inset-px bg-gradient-to-r from-[#44BCFF] via-[#FF44EC] to-[#FF675E] rounded-xl blur-lg group-hover:opacity-100 group-hover:-inset-1 group-hover:duration-200 animate-tilt" />
                <a href="/register" title="" class="relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-gray-900 font-pj rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900" role="button">
                  Get access now
                </a>
              </div>
            </div>
          </div>

          <div class="mt-20 md:mt-32">
            <blockquote class="mt-10">
              <div class="mx-3 md:mx-10 lg:mx-auto max-w-3xl mx-auto text-center text-2xl leading-9 font-medium">
                <p>
                  &ldquo;The community really needs this and you are doing something really important!&rdquo;
                </p>
              </div>
              <footer class="mt-8">
                <div class="md:flex md:items-center md:justify-center">
                  <div class="md:flex-shrink-0">
                    <img
                      class="mx-auto h-10 w-10 rounded-full"
                      src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                      alt=""
                    >
                  </div>
                  <div class="mt-3 text-center md:mt-0 md:ml-4 md:flex md:items-center">
                    <div class="text-base font-medium mr-2">
                      Judith Black
                    </div>
                    /
                    <div class="text-base font-medium text-gray-400 ml-2">
                      CEO, Workcation
                    </div>
                  </div>
                </div>
              </footer>
            </blockquote>
          </div>
        </section>
        <section class="relative my-20 py-20 bg-gray-800">
          <svg class="hidden absolute md:block md:-top-5 md:m-0 md:-left-1/3 lg:-left-16" width="404" height="392" fill="none" viewBox="0 0 404 392">
            <defs>
              <pattern id="837c3e70-6c3a-44e6-8854-cc48c737b659" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="4" height="4" class="text-gray-200" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="404" height="392" fill="url(#837c3e70-6c3a-44e6-8854-cc48c737b659)" />
          </svg>
          <svg class="hidden absolute md:block md:-bottom-5 md:m-0 md:-right-1/3 lg:-right-16" width="404" height="392" fill="none" viewBox="0 0 404 392">
            <defs>
              <pattern id="837c3e70-6c3a-44e6-8854-cc48c737b659" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="4" height="4" class="text-gray-200" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="404" height="392" fill="url(#837c3e70-6c3a-44e6-8854-cc48c737b659)" />
          </svg>
          <div class="text-center">
            <h1 class="text-5xl font-semibold">
              From webapp to mobile with live updates in 5 mins !
            </h1>
            <p class="my-10 text-xl">
              Get started by installing the plugin<br>
              then see your changes on your own device.
            </p>
            <img
              class="mx-auto h-62 rounded-lg"
              src="/seeit.png"
              alt=""
            >
            <p class="mt-10">
              See it on device &uArr;
            </p>
          </div>
        </section>
        <section class="mx-10 lg:px-32 lg:mx-20">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-10 py-20">
            <div class="order-last md:order-none">
              <h2 class="text-4xl md:text-6xl font-extrabold my-10">
                Develop
              </h2>
              <p class="text-lg lg:w-2/3">
                Develop for all your users' devices with just one codebase. Add fast refresh, true native capabilities, and your creativity, and you'll have the app your users want in no time.
              </p>
            </div>
            <img
              class="mx-auto h-62 rounded-lg"
              src="/undraw_dev_productivity_umsq.svg"
              alt=""
            >
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-10 py-20">
            <img
              class="mx-auto h-62 rounded-lg"
              src="/undraw_develop_app_re_bi4i.svg"
              alt=""
            >
            <div>
              <h2 class="text-4xl md:text-6xl font-extrabold my-10">
                Build
              </h2>
              <p class="text-lg lg:w-2/3">
                Ready to ship? Let us do the heavy lifting. Capgo handles the gritty parts of building for each app store so you don't need Xcode or Android Studio to get your app into people's hands.
              </p>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-10 py-20">
            <div class="order-last md:order-none">
              <h2 class="text-4xl md:text-6xl font-extrabold my-10">
                Update
              </h2>
              <p class="text-lg lg:w-2/3">
                Shipped a bug? No worries: with one command, you can deploy a fix that your users will see instantly, without having to re-download your app.
              </p>
            </div>
            <img
              class="mx-auto h-62 rounded-lg"
              src="/undraw_pull_request_gld8.svg"
              alt=""
            >
          </div>
        </section>
        <div class="relative mt-24 sm:mt-32 sm:py-16">
          <div aria-hidden="true" class="hidden sm:block">
            <div class="absolute inset-y-0 left-0 w-1/2 bg-gray-800 rounded-r-3xl" />
            <svg class="absolute top-8 left-1/2 -ml-3" width="404" height="392" fill="none" viewBox="0 0 404 392">
              <defs>
                <pattern id="8228f071-bcee-4ec8-905a-2a059a2cc4fb" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="4" height="4" class="text-gray-200" fill="currentColor" />
                </pattern>
              </defs>
              <rect width="404" height="392" fill="url(#8228f071-bcee-4ec8-905a-2a059a2cc4fb)" />
            </svg>
          </div>
          <div class="mx-auto max-w-md px-4 sm:max-w-3xl sm:px-6 lg:max-w-7xl lg:px-8">
            <div class="relative rounded-2xl px-6 py-10 bg-gray-700 overflow-hidden shadow-xl sm:px-12 sm:py-20">
              <div aria-hidden="true" class="absolute inset-0 -mt-72 sm:-mt-32 md:mt-0">
                <svg class="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 1463 360">
                  <path class="text-gray-600 text-opacity-40" fill="currentColor" d="M-82.673 72l1761.849 472.086-134.327 501.315-1761.85-472.086z" />
                  <path class="text-gray-800 text-opacity-40" fill="currentColor" d="M-217.088 544.086L1544.761 72l134.327 501.316-1761.849 472.086z" />
                </svg>
              </div>
              <div class="relative flex flex-col">
                <div class="sm:text-center">
                  <h2 class="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
                    Create amazing app
                  </h2>
                  <p class="mt-6 mx-auto max-w-2xl text-lg text-gray-100">
                    in a record time, with capgo and capacitor
                  </p>
                </div>
                <router-link to="/register" class="w-auto inline-block mt-5 mx-auto rounded-md border border-transparent px-5 py-3 bg-gray-900 text-base font-medium text-white shadow hover:bg-black focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-rose-500 sm:px-10">
                  Get started &RightArrow;
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>
